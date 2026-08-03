alter table public.projects
  add column if not exists client_id text;

update public.projects
set client_id = coalesce(nullif(project_data ->> 'id', ''), id::text)
where client_id is null or client_id = '';

alter table public.projects
  alter column client_id set not null;

create unique index if not exists projects_user_id_client_id_key
  on public.projects (user_id, client_id);
