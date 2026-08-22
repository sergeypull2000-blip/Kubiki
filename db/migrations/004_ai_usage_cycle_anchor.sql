alter table public.ai_usage_limits
  add column cycle_anchor_at timestamptz;

-- Reservations are short-lived leases, not billing records. Clearing them
-- avoids carrying duplicate historical month keys into the new per-user key.
delete from public.ai_usage_reservations;

alter table public.ai_usage_reservations
  drop constraint ai_usage_reservations_pkey;

alter table public.ai_usage_reservations
  rename column month_start to cycle_start;

alter table public.ai_usage_reservations
  alter column cycle_start type timestamptz using cycle_start::timestamptz,
  alter column cycle_start drop not null;

alter table public.ai_usage_reservations
  add primary key (user_id);
