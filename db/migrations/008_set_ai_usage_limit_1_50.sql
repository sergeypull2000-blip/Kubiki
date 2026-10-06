alter table public.ai_usage_limits
  alter column monthly_limit_usd set default 1.5;

update public.ai_usage_limits
set monthly_limit_usd = 1.5
where monthly_limit_usd > 1.5;
