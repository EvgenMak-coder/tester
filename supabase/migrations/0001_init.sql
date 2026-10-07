-- Tester: начальная схема синхронизации.
-- Выполняется скриптом scripts/migrate.py или вручную: Supabase → SQL Editor → вставить → Run.
--
-- Приложение хранит данные на устройстве и обменивается с облаком изменениями.
-- У каждой строки две отметки времени:
--   updated_at — когда запись изменили на устройстве; при споре побеждает более поздняя;
--   synced_at  — когда строка попала в облако; по ней устройства забирают новое с прошлого раза.

create table courses (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  course_id text not null,
  content jsonb not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

-- Сброс прогресса и удаление курса: всё, что старше updated_at, устройства у себя стирают.
create table course_clears (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  course_id text not null,
  deleted boolean not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

create table question_progress (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  course_id text not null,
  question_id text not null,
  seen int not null check (seen >= 0),
  correct int not null check (correct >= 0),
  wrong int not null check (wrong >= 0),
  last_correct boolean not null,
  box int not null check (box between 0 and 5),
  due date not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, course_id, question_id)
);

create table attempts (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  course_id text not null,
  mode text not null check (mode in ('practice', 'mistakes', 'review', 'exam')),
  level text check (level in ('basic', 'intermediate', 'advanced')),
  finished_at timestamptz not null,
  total int not null check (total >= 0),
  correct int not null check (correct >= 0),
  duration_sec int not null check (duration_sec >= 0),
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index on courses (user_id, synced_at);
create index on course_clears (user_id, synced_at);
create index on question_progress (user_id, synced_at);
create index on attempts (user_id, synced_at);

-- Устройство с устаревшими данными не должно затереть более свежую запись:
-- обновление, которое не новее уже лежащей строки, молча пропускается.
create function keep_newer() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at <= old.updated_at then
    return null;
  end if;
  new.synced_at := now();
  return new;
end;
$$;

create function touch_synced() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.synced_at := now();
  return new;
end;
$$;

create trigger keep_newer before insert or update on courses for each row execute function keep_newer();
create trigger keep_newer before insert or update on course_clears for each row execute function keep_newer();
create trigger keep_newer before insert or update on question_progress for each row execute function keep_newer();
create trigger touch_synced before insert or update on attempts for each row execute function touch_synced();

-- Каждый видит и меняет только свои строки; без входа не видно ничего.
alter table courses enable row level security;
alter table course_clears enable row level security;
alter table question_progress enable row level security;
alter table attempts enable row level security;

create policy own_rows on courses for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on course_clears for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on question_progress for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on attempts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
