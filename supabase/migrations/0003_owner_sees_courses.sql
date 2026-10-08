-- Владелец приложения видит курсы всех пользователей.
-- Прогресс, попытки и ошибки остаются личными: правила доступа к ним эта миграция не меняет.

-- Кто считается владельцем. Политик у таблицы нет, поэтому через API её не прочитать и не изменить:
-- ею пользуются только функции ниже. Добавить ещё одного владельца: insert into admins values ('<id пользователя>').
create table admins (
  user_id uuid primary key references auth.users on delete cascade
);
alter table admins enable row level security;

-- Владельцем становится первый зарегистрированный пользователь.
insert into admins select id from auth.users order by created_at limit 1;

create function is_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- Список чужих курсов без содержимого: оно бывает больше мегабайта и нужно только при добавлении.
create function shared_courses()
returns table (owner_id uuid, owner_email text, course_id text, title text, modules int, questions int, updated_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select c.user_id,
         u.email::text,
         c.course_id,
         c.content ->> 'title',
         jsonb_array_length(c.content -> 'topics'),
         (select coalesce(sum(jsonb_array_length(t -> 'questions')), 0)::int from jsonb_array_elements(c.content -> 'topics') t),
         c.updated_at
  from public.courses c
  join auth.users u on u.id = c.user_id
  where public.is_admin() and c.user_id <> (select auth.uid())
  order by c.updated_at desc;
$$;

create function shared_course(owner uuid, course text) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select c.content from public.courses c where public.is_admin() and c.user_id = owner and c.course_id = course;
$$;

-- функции доступны только вошедшим пользователям; не владельцу они отвечают пустым результатом
revoke all on function is_admin() from public, anon;
revoke all on function shared_courses() from public, anon;
revoke all on function shared_course(uuid, text) from public, anon;
grant execute on function is_admin() to authenticated;
grant execute on function shared_courses() to authenticated;
grant execute on function shared_course(uuid, text) to authenticated;
