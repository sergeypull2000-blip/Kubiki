alter table public.studio_export_profiles
  add column if not exists company_position text not null default 'left';

alter table public.studio_export_profiles
  add constraint studio_export_profiles_company_position_check
  check (company_position in ('left', 'center', 'right'));
