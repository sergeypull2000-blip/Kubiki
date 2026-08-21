-- Kubiki greenfield application baseline for PostgreSQL 16.
-- No Supabase roles, RLS, auth objects, storage objects, or data are imported.
set search_path = public, pg_catalog;

create table public.users (
  id uuid primary key,
  created_at timestamptz not null default now(),
  constraint users_better_auth_user_fkey
    foreign key (id) references auth."user" (id) on delete cascade
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null default 'Без названия',
  data_version integer not null default 1,
  project_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_id text not null,
  constraint projects_user_id_client_id_key unique (user_id, client_id)
);
create index projects_updated_at_idx on public.projects (updated_at desc);
create index projects_user_id_idx on public.projects (user_id);
create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();

create table public.performers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  client_id text not null,
  performer_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint performers_user_id_client_id_key unique (user_id, client_id)
);
create index performers_user_id_idx on public.performers (user_id);
create trigger performers_set_updated_at before update on public.performers
for each row execute function public.set_updated_at();

create table public.quick_access_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  client_id text not null,
  performer_client_id text not null,
  pinned boolean not null default false,
  sort_order integer not null default 0,
  item_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quick_access_user_client_key unique (user_id, client_id),
  constraint quick_access_user_performer_key unique (user_id, performer_client_id),
  constraint quick_access_performer_fk foreign key (user_id, performer_client_id)
    references public.performers (user_id, client_id) on delete cascade
);
create index quick_access_items_user_id_idx on public.quick_access_items (user_id);
create index quick_access_items_user_sort_idx
  on public.quick_access_items (user_id, pinned desc, sort_order);
create trigger quick_access_items_set_updated_at before update on public.quick_access_items
for each row execute function public.set_updated_at();

create table public.template_libraries (
  user_id uuid primary key references public.users (id) on delete cascade,
  data_version integer not null default 1,
  library_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger template_libraries_set_updated_at before update on public.template_libraries
for each row execute function public.set_updated_at();

create table public.ai_settings (
  user_id uuid primary key references public.users (id) on delete cascade,
  personalization text not null default '',
  use_project_history boolean not null default false,
  use_studio_templates boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_settings_personalization_size
    check (octet_length(personalization) <= 12000)
);
create trigger ai_settings_set_updated_at before update on public.ai_settings
for each row execute function public.set_updated_at();

create table public.studio_export_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  company_name text not null default '',
  logo_asset_path text,
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  default_colors jsonb not null default '{}'::jsonb,
  default_font text not null default 'Roboto',
  default_legal_text jsonb not null default '{}'::jsonb,
  logo_position text not null default 'left',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_export_profiles_default_colors_object
    check (jsonb_typeof(default_colors) = 'object'),
  constraint studio_export_profiles_default_legal_text_object
    check (jsonb_typeof(default_legal_text) = 'object'),
  constraint studio_export_profiles_logo_asset_path_safe
    check (logo_asset_path is null or (
      length(logo_asset_path) <= 512 and
      logo_asset_path !~ '(^|/)\.\.(/|$)'
    )),
  constraint studio_export_profiles_logo_position_check
    check (logo_position in ('left', 'center', 'right'))
);

create table public.export_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  preset_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint export_presets_name_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint export_presets_preset_json_object
    check (jsonb_typeof(preset_json) = 'object')
);
create index export_presets_user_id_updated_at_idx
  on public.export_presets (user_id, updated_at desc);

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  model text not null,
  stage text,
  request_id text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric,
  pricing_version integer,
  pricing_status text,
  created_at timestamptz not null default now()
);
create index ai_usage_events_user_id_created_at_idx
  on public.ai_usage_events (user_id, created_at desc);

create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  event_type text not null,
  request_id text,
  session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index product_events_user_id_created_at_idx
  on public.product_events (user_id, created_at desc);
create index product_events_event_type_idx on public.product_events (event_type);

create table public.user_flags (
  user_id uuid primary key references public.users (id) on delete cascade,
  beta_welcome_seen boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger user_flags_set_updated_at before update on public.user_flags
for each row execute function public.set_updated_at();

create table public.ai_usage_limits (
  user_id uuid primary key references public.users (id) on delete cascade,
  monthly_limit_usd numeric not null default 5,
  unlimited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger ai_usage_limits_set_updated_at before update on public.ai_usage_limits
for each row execute function public.set_updated_at();

create table public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  message text not null,
  context text,
  project_id text,
  sheet_id text,
  created_at timestamptz not null default now()
);
create index beta_feedback_user_id_created_at_idx
  on public.beta_feedback (user_id, created_at desc);
