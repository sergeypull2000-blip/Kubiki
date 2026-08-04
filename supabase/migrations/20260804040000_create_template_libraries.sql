create table public.template_libraries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data_version integer not null default 1,
  library_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger template_libraries_set_updated_at
before update on public.template_libraries
for each row execute function public.set_updated_at();

alter table public.template_libraries enable row level security;

create policy "template_libraries_select_own" on public.template_libraries for select to authenticated using ((select auth.uid()) = user_id);
create policy "template_libraries_insert_own" on public.template_libraries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "template_libraries_update_own" on public.template_libraries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "template_libraries_delete_own" on public.template_libraries for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.template_libraries to authenticated;
