set search_path = public, pg_catalog;

create table public.user_legal_acceptances (
  user_id uuid not null references public.users (id) on delete cascade,
  document_key text not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  constraint user_legal_acceptances_document_key_check
    check (document_key in ('beta_terms', 'personal_data_consent', 'ai_disclosure')),
  constraint user_legal_acceptances_version_check
    check (char_length(btrim(version)) between 1 and 32),
  constraint user_legal_acceptances_pkey primary key (user_id, document_key, version)
);

create index user_legal_acceptances_user_id_accepted_at_idx
  on public.user_legal_acceptances (user_id, accepted_at desc);
