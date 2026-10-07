"""Выполняет в Supabase ещё не выполненные файлы из supabase/migrations.

Запуск из корня проекта:
    python scripts/migrate.py            # выполнить всё новое
    python scripts/migrate.py --status   # только показать, что выполнено, ничего не менять

Нужен личный токен Supabase в .env.local:
    SUPABASE_ACCESS_TOKEN=sbp_...
Токен даёт полный доступ к аккаунту Supabase, поэтому лежит только в .env.local (в git не попадает)
и не начинается с VITE_ — в сборку сайта такие переменные не включаются.

Что уже выполнено, скрипт помнит в таблице schema_migrations. Файлы, выполненные раньше вручную,
узнаёт по их таблицам: если все таблицы из файла уже существуют, файл помечается выполненным.
"""

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = ROOT / "supabase" / "migrations"
API = "https://api.supabase.com/v1/projects/{ref}/database/query"


def read_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = ROOT / ".env.local"
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


class Database:
    def __init__(self, ref: str, token: str):
        self.url = API.format(ref=ref)
        self.token = token

    def run(self, sql: str) -> list[dict]:
        request = urllib.request.Request(
            self.url,
            data=json.dumps({"query": sql}).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
                # без своего заголовка запросы стандартной библиотеки иногда отсекает защита сайта
                "User-Agent": "tester-migrate/1.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = response.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            if error.code in (401, 403):
                raise SystemExit(f"Supabase не принял токен ({error.code}). Проверь SUPABASE_ACCESS_TOKEN в .env.local.\n{detail[:300]}")
            raise SystemExit(f"Supabase ответил ошибкой {error.code}:\n{detail[:1500]}")
        except urllib.error.URLError as error:
            raise SystemExit(f"Не удалось связаться с Supabase: {error.reason}")
        return json.loads(body) if body.strip() else []


def quote(text: str) -> str:
    return "'" + text.replace("'", "''") + "'"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    status_only = "--status" in sys.argv
    env = read_env()
    token = env.get("SUPABASE_ACCESS_TOKEN", "")
    match = re.match(r"https://([a-z0-9]+)\.supabase\.co", env.get("VITE_SUPABASE_URL", ""))
    if not match:
        raise SystemExit("В .env.local нет VITE_SUPABASE_URL — непонятно, к какому проекту подключаться.")
    if not token:
        raise SystemExit(
            "В .env.local нет SUPABASE_ACCESS_TOKEN.\n"
            "Создай токен: supabase.com → значок аккаунта → Account preferences → Access Tokens → Generate new token,\n"
            "и добавь в .env.local строку SUPABASE_ACCESS_TOKEN=sbp_..."
        )
    db = Database(match.group(1), token)

    if not status_only:
        # журнал выполненного; RLS включён без правил — через сайт таблица недоступна
        db.run(
            "create table if not exists public.schema_migrations "
            "(name text primary key, applied_at timestamptz not null default now());"
            "alter table public.schema_migrations enable row level security;"
        )
    tables = {row["tablename"] for row in db.run("select tablename from pg_tables where schemaname = 'public'")}
    applied = (
        {row["name"] for row in db.run("select name from public.schema_migrations")}
        if "schema_migrations" in tables or not status_only
        else set()
    )

    done = 0
    for path in sorted(MIGRATIONS.glob("*.sql")):
        name = path.name
        if name in applied:
            print(f"  уже выполнено   {name}")
            continue
        sql = path.read_text(encoding="utf-8")
        creates = set(re.findall(r"create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)", sql, flags=re.I))
        if creates and creates <= tables:
            # выполняли вручную ещё до появления скрипта
            print(f"  было вручную    {name}")
            if not status_only:
                db.run(f"insert into public.schema_migrations (name) values ({quote(name)}) on conflict do nothing")
            continue
        if status_only:
            print(f"  НЕ ВЫПОЛНЕНО    {name}")
            continue
        # файл и запись в журнал — одной транзакцией: либо всё, либо ничего
        db.run(f"begin;\n{sql}\ninsert into public.schema_migrations (name) values ({quote(name)});\ncommit;")
        print(f"  ВЫПОЛНЕНО       {name}")
        done += 1

    if done:
        # сайт узнаёт о новых таблицах сразу, не дожидаясь обновления кэша
        db.run("notify pgrst, 'reload schema'")
    print("Готово." if not status_only else "Это только проверка — ничего не менялось.")


if __name__ == "__main__":
    main()
