set search_path = public, pg_catalog;

alter table public.user_legal_acceptances
  add column revoked_at timestamptz;

alter table public.user_legal_acceptances drop constraint user_legal_acceptances_document_key_check;
alter table public.user_legal_acceptances add constraint user_legal_acceptances_document_key_check
  check (document_key in ('beta_terms', 'personal_data_consent', 'ai_disclosure', 'ai_improvement_consent'));

create table public.ai_feedback_samples (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  operation text not null check (operation in ('generate', 'edit', 'import')),
  ai_request_id text,
  ai_snapshot jsonb not null check (jsonb_typeof(ai_snapshot) = 'object'),
  human_snapshot jsonb check (human_snapshot is null or jsonb_typeof(human_snapshot) = 'object'),
  diff jsonb check (diff is null or jsonb_typeof(diff) = 'object'),
  accepted_without_correction boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  constraint ai_feedback_samples_final_state_check check (finalized_at is null or accepted_without_correction is not null)
);

create index ai_feedback_samples_project_id_active_idx on public.ai_feedback_samples (project_id) where finalized_at is null;
create index ai_feedback_samples_project_id_idx on public.ai_feedback_samples (project_id);
create unique index ai_feedback_samples_request_once_idx on public.ai_feedback_samples (project_id, ai_request_id) where ai_request_id is not null;
