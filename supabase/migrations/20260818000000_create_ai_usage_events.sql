create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null,
  stage text,
  request_id text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric,
  pricing_version integer,
  pricing_status text,
  created_at timestamptz not null default now()
);

create index ai_usage_events_user_id_created_at_idx on public.ai_usage_events (user_id, created_at desc);

alter table public.ai_usage_events enable row level security;

create policy "ai_usage_events_select_own" on public.ai_usage_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "ai_usage_events_insert_own" on public.ai_usage_events for insert to authenticated with check ((select auth.uid()) = user_id);

grant select, insert on table public.ai_usage_events to authenticated;
