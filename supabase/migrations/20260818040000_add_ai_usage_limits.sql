-- Per-user AI monthly usage limit override.
-- Default is $5/month (see DEFAULT_MONTHLY_LIMIT_USD in api/_lib/aiPricing.js).
-- Administrators manage rows manually via Supabase Dashboard / SQL.
-- Authenticated users can only READ their own row; they cannot insert,
-- update or delete their quota override themselves.
create table public.ai_usage_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_limit_usd numeric not null default 5,
  unlimited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_usage_limits enable row level security;

-- Только чтение собственной строки: приложение показывает эффективный лимит,
-- а запись/изменение/удаление выполняет администратор вручную.
create policy "ai_usage_limits_select_own" on public.ai_usage_limits for select to authenticated using ((select auth.uid()) = user_id);

grant select on table public.ai_usage_limits to authenticated;

create trigger ai_usage_limits_set_updated_at
before update on public.ai_usage_limits
for each row execute function public.set_updated_at();
