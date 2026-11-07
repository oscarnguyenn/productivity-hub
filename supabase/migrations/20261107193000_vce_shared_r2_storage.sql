alter table public.vce_shared_resources
  drop constraint if exists vce_shared_resources_byte_size_check;

alter table public.vce_shared_resources
  add constraint vce_shared_resources_byte_size_check
  check (byte_size between 0 and 10000000000);

create or replace function public.vce_shared_storage_bytes()
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_user() or not public.is_admin() then
    raise exception 'Administrator access is required to check shared storage usage.';
  end if;

  return coalesce((select sum(byte_size) from public.vce_shared_resources), 0);
end;
$$;

revoke all on function public.vce_shared_storage_bytes() from public, anon;
grant execute on function public.vce_shared_storage_bytes() to authenticated;

create or replace function public.enforce_vce_shared_storage_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_bytes bigint;
begin
  perform pg_advisory_xact_lock(hashtext('vce_shared_storage_limit'));
  select coalesce(sum(byte_size), 0)
    into current_bytes
    from public.vce_shared_resources
    where id <> new.id;

  if current_bytes + new.byte_size > 10000000000 then
    raise exception 'The 10 GB shared-library storage limit would be exceeded.';
  end if;

  return new;
end;
$$;

drop trigger if exists vce_shared_storage_limit on public.vce_shared_resources;
create trigger vce_shared_storage_limit
  before insert or update of byte_size on public.vce_shared_resources
  for each row execute function public.enforce_vce_shared_storage_limit();
