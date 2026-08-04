create table public.ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  personalization text not null default '',
  use_project_history boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_settings_personalization_size check (octet_length(personalization) <= 12000)
);

create trigger ai_settings_set_updated_at
before update on public.ai_settings
for each row execute function public.set_updated_at();

alter table public.ai_settings enable row level security;

create policy "ai_settings_select_own" on public.ai_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "ai_settings_insert_own" on public.ai_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ai_settings_update_own" on public.ai_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "ai_settings_delete_own" on public.ai_settings for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.ai_settings to authenticated;

