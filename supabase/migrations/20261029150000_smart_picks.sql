-- Smart picks and curated collections (build session 3.7).
--
-- item_pairs counts how often two products were bought in the same completed order over the last
-- 60 days. pg_cron rebuilds it every night (refresh_smart_picks), and smart_picks suggests what goes
-- with a cart. Collections are hand-picked sets admins curate, like an exam kit or fest merchandise.

create table public.item_pairs (
  master_a uuid not null references public.master_products (id) on delete cascade,
  master_b uuid not null references public.master_products (id) on delete cascade,
  orders integer not null,
  refreshed_at timestamptz not null default now(),
  primary key (master_a, master_b)
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 60),
  subtitle text not null default '' check (length(subtitle) <= 120),
  sort integer not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  master_product_id uuid not null references public.master_products (id) on delete cascade,
  sort integer not null default 0,
  primary key (collection_id, master_product_id)
);

alter table public.item_pairs enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
create policy "admins read item pairs" on public.item_pairs for select to authenticated using (public.is_admin());
create policy "everyone reads running collections" on public.collections
  for select to authenticated using ((active and starts_at <= now() and (ends_at is null or ends_at > now())) or public.is_admin());
create policy "admins manage collections" on public.collections
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "everyone reads items of visible collections" on public.collection_items
  for select to authenticated using (exists (select 1 from public.collections c where c.id = collection_id));
create policy "admins manage collection items" on public.collection_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.item_pairs to authenticated;
grant select, insert, update, delete on public.collections, public.collection_items to authenticated;

-- Rebuilds item_pairs from the last 60 days of completed orders. Returns how many pairs it found.
create or replace function public.refresh_smart_picks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.item_pairs;
  insert into public.item_pairs (master_a, master_b, orders)
  select a.master, b.master, count(distinct a.order_id)::integer
  from (
    select distinct i.order_id, v.master_product_id as master
    from public.order_items i
    join public.orders o on o.id = i.order_id
    join public.variants v on v.id = i.variant_id
    where o.status in ('delivered', 'collected') and o.placed_at > now() - interval '60 days'
  ) a
  join (
    select distinct i.order_id, v.master_product_id as master
    from public.order_items i
    join public.orders o on o.id = i.order_id
    join public.variants v on v.id = i.variant_id
    where o.status in ('delivered', 'collected') and o.placed_at > now() - interval '60 days'
  ) b on b.order_id = a.order_id and b.master <> a.master
  group by a.master, b.master;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Up to 6 products often bought with what is in the cart (given as sizes or products), that some
-- open shop has now, with the lowest price. Nothing already in the cart.
create or replace function public.smart_picks(p_variant_ids uuid[] default '{}', p_master_ids uuid[] default '{}')
returns table (master_product_id uuid, name text, size text, image_path text, photo_credit text, photo_source_url text, min_price_paise integer, together integer)
language sql
stable
security definer
set search_path = ''
as $$
  with in_cart as (
    select v.master_product_id as id from public.variants v where v.id = any (coalesce(p_variant_ids, '{}'))
    union
    select unnest(coalesce(p_master_ids, '{}'))
  ), suggested as (
    select p.master_b as id, sum(p.orders)::integer as together
    from public.item_pairs p
    where p.master_a in (select id from in_cart) and p.master_b not in (select id from in_cart)
    group by p.master_b
  )
  select m.id, m.name, m.size, m.image_path, m.photo_credit, m.photo_source_url, min(v.price_paise)::integer, s.together
  from suggested s
  join public.master_products m on m.id = s.id
  join public.variants v on v.master_product_id = m.id and v.in_stock
  join public.products pr on pr.id = v.product_id and pr.active
  join public.shops sh on sh.id = pr.shop_id and sh.is_open
  where (select auth.uid()) is not null
  group by m.id, s.together
  order by s.together desc, m.name
  limit 6;
$$;

-- Running collections with the products in them that some open shop has now.
create or replace function public.collection_products()
returns table (collection_id uuid, title text, subtitle text, master_product_id uuid, name text, size text, image_path text, photo_credit text, photo_source_url text, min_price_paise integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.title, c.subtitle, m.id, m.name, m.size, m.image_path, m.photo_credit, m.photo_source_url,
    min(v.price_paise)::integer
  from public.collections c
  join public.collection_items ci on ci.collection_id = c.id
  join public.master_products m on m.id = ci.master_product_id
  join public.variants v on v.master_product_id = m.id and v.in_stock
  join public.products pr on pr.id = v.product_id and pr.active
  join public.shops sh on sh.id = pr.shop_id and sh.is_open
  where c.active and c.starts_at <= now() and (c.ends_at is null or c.ends_at > now())
  group by c.id, m.id, ci.sort
  order by c.sort, c.created_at, ci.sort, m.name;
$$;

revoke all on function public.refresh_smart_picks() from public, anon, authenticated;
revoke all on function public.smart_picks(uuid[], uuid[]) from public, anon;
revoke all on function public.collection_products() from public, anon;
grant execute on function public.smart_picks(uuid[], uuid[]) to authenticated;
grant execute on function public.collection_products() to authenticated;
