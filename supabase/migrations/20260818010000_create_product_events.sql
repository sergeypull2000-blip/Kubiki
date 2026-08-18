create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  request_id text,
  session_id text,
  created_at timestamptz not null default now()
);

create index product_events_user_id_created_at_idx on public.product_events (user_id, created_at desc);
create index product_events_event_type_idx on public.product_events (event_type);

alter table public.product_events enable row level security;

create policy "product_events_select_own" on public.product_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "product_events_insert_own" on public.product_events for insert to authenticated with check ((select auth.uid()) = user_id);

grant select, insert on table public.product_events to authenticated;
