create table public.performers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  performer_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint performers_user_id_client_id_key unique (user_id, client_id)
);

create index performers_user_id_idx on public.performers (user_id);

do $$
begin
  if to_regprocedure('public.set_updated_at()') is null then
    execute $function$
      create function public.set_updated_at()
      returns trigger
      language plpgsql
      set search_path = ''
      as 'begin new.updated_at = now(); return new; end;'
    $function$;
  end if;
end
$$;

create trigger performers_set_updated_at
before update on public.performers
for each row execute function public.set_updated_at();

alter table public.performers enable row level security;

create policy "performers_select_own" on public.performers for select to authenticated using ((select auth.uid()) = user_id);
create policy "performers_insert_own" on public.performers for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "performers_update_own" on public.performers for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "performers_delete_own" on public.performers for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.performers to authenticated;
