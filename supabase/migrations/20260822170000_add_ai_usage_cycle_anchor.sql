alter table public.ai_usage_limits
  add column cycle_anchor_at timestamptz;

-- The anchor is intentionally nullable: absence means the user has never had a
-- successful billable DeepSeek response. It is initialized only by usage commit.

create or replace function public.commit_ai_usage(
  p_model text,
  p_stage text,
  p_request_id text,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cost_usd numeric,
  p_pricing_version integer,
  p_pricing_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into public.ai_usage_limits (user_id, cycle_anchor_at)
  values (current_user_id, now())
  on conflict (user_id) do update
    set cycle_anchor_at = coalesce(public.ai_usage_limits.cycle_anchor_at, excluded.cycle_anchor_at);

  insert into public.ai_usage_events
    (user_id, model, stage, request_id, input_tokens, output_tokens, cost_usd, pricing_version, pricing_status)
  values
    (current_user_id, p_model, p_stage, p_request_id, p_input_tokens, p_output_tokens, p_cost_usd, p_pricing_version, p_pricing_status);

  return true;
end;
$$;

revoke all on function public.commit_ai_usage(text, text, text, bigint, bigint, numeric, integer, text) from public;
grant execute on function public.commit_ai_usage(text, text, text, bigint, bigint, numeric, integer, text) to authenticated;
