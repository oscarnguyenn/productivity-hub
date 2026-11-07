create table if not exists public.vce_resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (length(title) between 1 and 255),
  subject text not null default 'General' check (length(subject) between 1 and 80),
  category text not null check (category in ('Exams', 'Textbooks', 'Miscellaneous', 'Contour', 'Other')),
  file_name text not null check (length(file_name) between 1 and 255),
  mime_type text not null default 'application/octet-stream' check (length(mime_type) between 1 and 255),
  byte_size bigint not null check (byte_size between 0 and 52428800),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

alter table public.vce_resources enable row level security;
revoke all on table public.vce_resources from anon, authenticated, public;

drop policy if exists "Users can read their own active VCE resources" on public.vce_resources;
create policy "Users can read their own active VCE resources"
  on public.vce_resources for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

drop policy if exists "Users can add their own active VCE resources" on public.vce_resources;
create policy "Users can add their own active VCE resources"
  on public.vce_resources for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

drop policy if exists "Users can delete their own active VCE resources" on public.vce_resources;
create policy "Users can delete their own active VCE resources"
  on public.vce_resources for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

grant select, insert, delete on public.vce_resources to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('vce-resources', 'vce-resources', false, 52428800)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800;

drop policy if exists "Users can read their own VCE resource files" on storage.objects;
create policy "Users can read their own VCE resource files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'vce-resources'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (select public.is_active_user())
  );

drop policy if exists "Users can upload their own VCE resource files" on storage.objects;
create policy "Users can upload their own VCE resource files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vce-resources'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (select public.is_active_user())
  );

drop policy if exists "Users can delete their own VCE resource files" on storage.objects;
create policy "Users can delete their own VCE resource files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vce-resources'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (select public.is_active_user())
  );
