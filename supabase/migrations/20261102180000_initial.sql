create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  username text not null unique check (username ~ '^[a-z0-9._-]{3,30}$'),
  role text not null default 'user' check (role in ('user', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_data (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (length(key) between 1 and 100),
  payload jsonb not null check (pg_column_size(payload) <= 5242880),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.profiles enable row level security;
alter table public.user_data enable row level security;

revoke all on table public.profiles from anon, authenticated, public;
revoke all on table public.user_data from anon, authenticated, public;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and is_active
  );
$$;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
begin
  if requested_username !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Username must be 3-30 characters and use lowercase letters, numbers, dots, underscores, or hyphens.';
  end if;

  insert into public.profiles (id, email, username)
  values (new.id, new.email, requested_username);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

drop policy if exists "Users can read their own profile and admins can read all" on public.profiles;
create policy "Users can read their own profile and admins can read all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Active users can read their own data" on public.user_data;
create policy "Active users can read their own data"
  on public.user_data for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

drop policy if exists "Active users can insert their own data" on public.user_data;
create policy "Active users can insert their own data"
  on public.user_data for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

drop policy if exists "Active users can update their own data" on public.user_data;
create policy "Active users can update their own data"
  on public.user_data for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

drop policy if exists "Active users can delete their own data" on public.user_data;
create policy "Active users can delete their own data"
  on public.user_data for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

create or replace function public.admin_set_user_role(target_user_id uuid, target_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access required.';
  end if;
  lock table public.profiles in exclusive mode;
  if not (select public.is_admin()) then
    raise exception 'Administrator access required.';
  end if;
  if target_role not in ('user', 'admin') then
    raise exception 'Invalid role.';
  end if;
  if target_user_id = (select auth.uid()) and target_role <> 'admin' then
    raise exception 'You cannot remove your own administrator role.';
  end if;
  if target_role = 'user' and exists (
    select 1
    from public.profiles
    where id = target_user_id and role = 'admin' and is_active
  ) and (
    select count(*) from public.profiles where role = 'admin' and is_active
  ) <= 1 then
    raise exception 'At least one active administrator must remain.';
  end if;

  update public.profiles set role = target_role where id = target_user_id;
  if not found then raise exception 'Account not found.'; end if;
end;
$$;

create or replace function public.admin_set_user_active(target_user_id uuid, target_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access required.';
  end if;
  lock table public.profiles in exclusive mode;
  if not (select public.is_admin()) then
    raise exception 'Administrator access required.';
  end if;
  if target_user_id = (select auth.uid()) and not target_active then
    raise exception 'You cannot deactivate your own account.';
  end if;
  if not target_active and exists (
    select 1
    from public.profiles
    where id = target_user_id and role = 'admin' and is_active
  ) and (
    select count(*) from public.profiles where role = 'admin' and is_active
  ) <= 1 then
    raise exception 'At least one active administrator must remain.';
  end if;

  update public.profiles set is_active = target_active where id = target_user_id;
  if not found then raise exception 'Account not found.'; end if;
end;
$$;

create or replace function public.restore_user_data(backup jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
begin
  if not (select public.is_active_user()) then
    raise exception 'Active account required.';
  end if;
  if backup is null or jsonb_typeof(backup) is distinct from 'object' then
    raise exception 'Backup must be a JSON object.';
  end if;
  if jsonb_object_length(backup) <> 7
    or jsonb_typeof(backup -> 'productivity-hub-tasks-v1') <> 'array'
    or jsonb_typeof(backup -> 'productivity-hub-calendar-events-v1') <> 'array'
    or jsonb_typeof(backup -> 'productivity-hub-notes-files-v1') <> 'array'
    or jsonb_typeof(backup -> 'productivity-hub-goals-v1') <> 'array'
    or jsonb_typeof(backup -> 'productivity-hub-projects-v1') <> 'array'
    or jsonb_typeof(backup -> 'productivity-hub-habits-v1') <> 'array'
    or jsonb_typeof(backup -> 'productivity-hub-sac-tracker-v1') <> 'object' then
    raise exception 'Backup does not contain all supported data sections.';
  end if;

  if exists (
    select 1
    from jsonb_each(backup) as section(key, payload)
    where key not in (
      'productivity-hub-tasks-v1',
      'productivity-hub-calendar-events-v1',
      'productivity-hub-notes-files-v1',
      'productivity-hub-goals-v1',
      'productivity-hub-projects-v1',
      'productivity-hub-habits-v1',
      'productivity-hub-sac-tracker-v1'
    ) or pg_column_size(payload) > 5242880
  ) then
    raise exception 'Backup contains unsupported data or an oversized section.';
  end if;

  delete from public.user_data
  where user_id = (select auth.uid())
    and key in (
      'productivity-hub-tasks-v1',
      'productivity-hub-calendar-events-v1',
      'productivity-hub-notes-files-v1',
      'productivity-hub-goals-v1',
      'productivity-hub-projects-v1',
      'productivity-hub-habits-v1',
      'productivity-hub-sac-tracker-v1'
    );

  for item in select key, value from jsonb_each(backup) loop
    insert into public.user_data (user_id, key, payload)
    values ((select auth.uid()), item.key, item.value);
  end loop;
end;
$$;

revoke all on function public.is_active_user() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.create_profile_for_new_user() from public;
revoke all on function public.admin_set_user_role(uuid, text) from public;
revoke all on function public.admin_set_user_active(uuid, boolean) from public;
revoke all on function public.restore_user_data(jsonb) from public;
revoke all on function public.set_user_data_updated_at() from public;

grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;
grant execute on function public.restore_user_data(jsonb) to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.user_data to authenticated;

create or replace function public.set_user_data_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_data_updated_at on public.user_data;
create trigger user_data_updated_at
  before update on public.user_data
  for each row execute procedure public.set_user_data_updated_at();
