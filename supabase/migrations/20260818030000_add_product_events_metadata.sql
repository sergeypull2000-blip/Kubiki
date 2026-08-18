alter table public.product_events
  add column metadata jsonb not null default '{}'::jsonb;
