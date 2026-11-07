alter table public.vce_shared_resources
  drop constraint if exists vce_shared_resources_byte_size_check;

alter table public.vce_shared_resources
  add constraint vce_shared_resources_byte_size_check
  check (byte_size between 0 and 20000000000);

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

  if current_bytes + new.byte_size > 20000000000 then
    raise exception 'The 20 GB shared-library storage limit would be exceeded.';
  end if;

  return new;
end;
$$;
