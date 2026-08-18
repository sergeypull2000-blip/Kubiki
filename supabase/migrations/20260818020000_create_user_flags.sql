create table public.user_flags (
  user_id uuid primary key references auth.users(id) on delete cascade,
  beta_welcome_seen boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_flags enable row level security;

create policy "user_flags_select_own" on public.user_flags for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_flags_insert_own" on public.user_flags for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_flags_update_own" on public.user_flags for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update on table public.user_flags to authenticated;

create trigger user_flags_set_updated_at
before update on public.user_flags
for each row execute function public.set_updated_at();
