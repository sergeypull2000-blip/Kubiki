create table public.quick_access_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
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
create index quick_access_items_user_sort_idx on public.quick_access_items (user_id, pinned desc, sort_order);

create trigger quick_access_items_set_updated_at before update on public.quick_access_items
for each row execute function public.set_updated_at();

alter table public.quick_access_items enable row level security;
create policy "quick_access_select_own" on public.quick_access_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "quick_access_insert_own" on public.quick_access_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "quick_access_update_own" on public.quick_access_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "quick_access_delete_own" on public.quick_access_items for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on table public.quick_access_items to authenticated;
