set search_path = auth, pg_catalog;

create table auth.email_delivery_rate_limits (
  bucket_scope text not null,
  subject_hash bytea not null,
  window_seconds integer not null,
  count integer not null default 0,
  window_started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint email_delivery_rate_limits_pkey
    primary key (bucket_scope, subject_hash, window_seconds),
  constraint email_delivery_rate_limits_scope_check
    check (bucket_scope in (
      'recipient:all',
      'recipient:verify_email',
      'recipient:reset_password',
      'smtp:signup',
      'smtp:resend',
      'smtp:password_reset',
      'smtp:total'
    )),
  constraint email_delivery_rate_limits_subject_hash_check
    check (octet_length(subject_hash) = 32),
  constraint email_delivery_rate_limits_window_check
    check (window_seconds in (60, 600, 3600, 86400)),
  constraint email_delivery_rate_limits_count_check
    check (count >= 0),
  constraint email_delivery_rate_limits_expiry_check
    check (expires_at >= window_started_at)
);

create index email_delivery_rate_limits_expires_at_idx
  on auth.email_delivery_rate_limits (expires_at);
