alter table public.studio_export_profiles
  add column if not exists logo_position text not null default 'left'
  check (logo_position in ('left', 'center', 'right'));
