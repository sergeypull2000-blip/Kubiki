-- Бета-фидбэк: пользователи оставляют текстовые отзывы прямо из приложения.
-- RLS: можно только ВСТАВИТЬ собственный отзыв (auth.uid() = user_id).
-- SELECT намеренно не выдаётся пользователям — читают фидбэк только админы
-- (Table Editor / SQL). Клиент делает исключительно INSERT.

create table public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  context text,
  project_id text,
  sheet_id text,
  created_at timestamptz not null default now()
);

create index beta_feedback_user_id_created_at_idx on public.beta_feedback (user_id, created_at desc);

alter table public.beta_feedback enable row level security;

create policy "beta_feedback_insert_own" on public.beta_feedback for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant insert on table public.beta_feedback to authenticated;
