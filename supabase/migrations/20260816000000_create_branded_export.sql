create table public.studio_export_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null default '',
  logo_asset_path text,
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  default_colors jsonb not null default '{}'::jsonb check (jsonb_typeof(default_colors) = 'object'),
  default_font text not null default 'Roboto',
  default_legal_text jsonb not null default '{}'::jsonb check (jsonb_typeof(default_legal_text) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (logo_asset_path is null or (length(logo_asset_path) <= 512 and logo_asset_path !~ '(^|/)\.\.(/|$)'))
);

create table public.export_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  preset_json jsonb not null check (jsonb_typeof(preset_json) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index export_presets_user_id_updated_at_idx on public.export_presets (user_id, updated_at desc);

alter table public.studio_export_profiles enable row level security;
alter table public.export_presets enable row level security;

create policy studio_export_profiles_select_own on public.studio_export_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy studio_export_profiles_insert_own on public.studio_export_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy studio_export_profiles_update_own on public.studio_export_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy studio_export_profiles_delete_own on public.studio_export_profiles for delete to authenticated using ((select auth.uid()) = user_id);
create policy export_presets_select_own on public.export_presets for select to authenticated using ((select auth.uid()) = user_id);
create policy export_presets_insert_own on public.export_presets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy export_presets_update_own on public.export_presets for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy export_presets_delete_own on public.export_presets for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.studio_export_profiles, public.export_presets to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('export-logos', 'export-logos', false, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy export_logos_select_own on storage.objects for select to authenticated
using (bucket_id = 'export-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy export_logos_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'export-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy export_logos_update_own on storage.objects for update to authenticated
using (bucket_id = 'export-logos' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'export-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy export_logos_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'export-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
