create table if not exists public.vce_shared_resources (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete restrict,
  title text not null check (length(title) between 1 and 255),
  subject text not null default 'General' check (length(subject) between 1 and 80),
  category text not null check (category in ('Exams', 'Textbooks', 'Miscellaneous', 'Contour', 'Other')),
  file_name text not null check (length(file_name) between 1 and 255),
  mime_type text not null default 'application/octet-stream' check (length(mime_type) between 1 and 255),
  byte_size bigint not null check (byte_size between 0 and 52428800),
  storage_path text not null unique check (storage_path like 'shared/%'),
  source_path text unique,
  created_at timestamptz not null default now()
);

create index if not exists vce_shared_resources_category_subject_idx
  on public.vce_shared_resources (category, subject);

alter table public.vce_shared_resources enable row level security;
revoke all on table public.vce_shared_resources from anon, authenticated, public;

drop policy if exists "Active users can read shared VCE resources" on public.vce_shared_resources;
create policy "Active users can read shared VCE resources"
  on public.vce_shared_resources for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists "Admins can add shared VCE resources" on public.vce_shared_resources;
create policy "Admins can add shared VCE resources"
  on public.vce_shared_resources for insert to authenticated
  with check (created_by = (select auth.uid()) and (select public.is_admin()));

drop policy if exists "Admins can update shared VCE resource details" on public.vce_shared_resources;
create policy "Admins can update shared VCE resource details"
  on public.vce_shared_resources for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can delete shared VCE resources" on public.vce_shared_resources;
create policy "Admins can delete shared VCE resources"
  on public.vce_shared_resources for delete to authenticated
  using ((select public.is_admin()));

grant select, insert, delete on public.vce_shared_resources to authenticated;
grant update (title, subject, category) on public.vce_shared_resources to authenticated;

drop policy if exists "Active users can read shared VCE files" on storage.objects;
create policy "Active users can read shared VCE files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'vce-resources'
    and (storage.foldername(name))[1] = 'shared'
    and (select public.is_active_user())
  );

drop policy if exists "Admins can upload shared VCE files" on storage.objects;
create policy "Admins can upload shared VCE files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vce-resources'
    and (storage.foldername(name))[1] = 'shared'
    and (select public.is_admin())
  );

drop policy if exists "Admins can delete shared VCE files" on storage.objects;
create policy "Admins can delete shared VCE files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vce-resources'
    and (storage.foldername(name))[1] = 'shared'
    and (select public.is_admin())
  );
