-- One master catalog (build session 3.1).
--
-- "Maggi 70 g" becomes one master product; each shop's size of it (a variants row) is that shop's
-- listing, with its own price and stock. The roadmap called for new listings tables; variants
-- already are exactly that, so they stay and gain master_product_id, and the order engine, search
-- and catalog editor keep working unchanged. Order items keep their own name and price, so old
-- bills read the same whatever happens to the catalog.
--
-- New sizes link themselves to a master by name and size (match_key). When admins merge duplicate
-- masters, the merged one's key is kept as an alias, so the duplicate never comes back.

create or replace function public.master_match_key(p_name text, p_size text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'))
    || '|' || lower(regexp_replace(trim(coalesce(p_size, '')), '\s+', ' ', 'g'));
$$;

create table public.master_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  brand text check (length(brand) <= 40),
  size text not null default '' check (length(size) <= 40),
  barcode text unique check (barcode ~ '^[0-9]{8,14}$'),
  category_id uuid references public.categories (id) on delete set null,
  image_path text,
  photo_credit text,
  photo_source_url text,
  match_key text not null unique,
  created_at timestamptz not null default now()
);

create table public.master_aliases (
  match_key text primary key,
  master_product_id uuid not null references public.master_products (id) on delete cascade
);

alter table public.variants add column master_product_id uuid references public.master_products (id);
create index variants_master_idx on public.variants (master_product_id);

-- The master for a name and size: an alias left by a merge, an existing master, or a new one.
create or replace function public.find_or_create_master(
  p_name text,
  p_size text,
  p_category_id uuid,
  p_image_path text,
  p_photo_credit text,
  p_photo_source_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := public.master_match_key(p_name, p_size);
  v_id uuid;
begin
  select master_product_id into v_id from public.master_aliases where match_key = v_key;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.master_products (name, size, category_id, image_path, photo_credit, photo_source_url, match_key)
  values (left(trim(p_name), 80), left(trim(coalesce(p_size, '')), 40), p_category_id, p_image_path, p_photo_credit,
          p_photo_source_url, v_key)
  on conflict (match_key) do update set match_key = excluded.match_key
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.link_master_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.products;
begin
  if new.master_product_id is null then
    select * into p from public.products where id = new.product_id;
    new.master_product_id := public.find_or_create_master(
      p.name, new.label, p.category_id, p.image_path, p.photo_credit, p.photo_source_url
    );
  end if;
  return new;
end;
$$;

create trigger link_master_product
  before insert on public.variants
  for each row execute function public.link_master_product();

-- Every size already on a menu gets its master. The best-photographed copy names the master.
insert into public.master_products (name, size, category_id, image_path, photo_credit, photo_source_url, match_key)
select distinct on (k.key) left(p.name, 80), left(v.label, 40), p.category_id, p.image_path, p.photo_credit,
  p.photo_source_url, k.key
from public.variants v
join public.products p on p.id = v.product_id
cross join lateral (select public.master_match_key(p.name, v.label) as key) k
order by k.key, (p.image_path is not null) desc, p.created_at
on conflict (match_key) do nothing;

update public.variants v set master_product_id = m.id
from public.products p, public.master_products m
where p.id = v.product_id and m.match_key = public.master_match_key(p.name, v.label) and v.master_product_id is null;

alter table public.master_products enable row level security;
alter table public.master_aliases enable row level security;
create policy "everyone reads the master catalog" on public.master_products
  for select to authenticated using (true);
create policy "admins edit master products" on public.master_products
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins read aliases" on public.master_aliases
  for select to authenticated using (public.is_admin());
grant select, update on public.master_products to authenticated;
grant select on public.master_aliases to authenticated;

-- Folds a duplicate master into the one to keep: its listings move over, and its key becomes an
-- alias so new sizes with that name join the kept master. Old bills are untouched.
create or replace function public.merge_master_products(p_keep uuid, p_merge uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_moved integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins can merge products' using errcode = '42501';
  end if;
  if p_keep = p_merge then
    raise exception 'Pick two different products' using errcode = '22023';
  end if;
  select match_key into v_key from public.master_products where id = p_merge for update;
  if not found or not exists (select 1 from public.master_products where id = p_keep) then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  update public.variants set master_product_id = p_keep where master_product_id = p_merge;
  get diagnostics v_moved = row_count;
  update public.master_aliases set master_product_id = p_keep where master_product_id = p_merge;
  -- Keep the barcode if only the merged one had it.
  update public.master_products k set barcode = coalesce(k.barcode, m.barcode)
  from public.master_products m where k.id = p_keep and m.id = p_merge;
  update public.master_products set barcode = null where id = p_merge;
  delete from public.master_products where id = p_merge;
  insert into public.master_aliases (match_key, master_product_id) values (v_key, p_keep)
  on conflict (match_key) do update set master_product_id = excluded.master_product_id;
  return v_moved;
end;
$$;

-- Admin catalog list: each master with how many shops list it and its price range.
create or replace function public.list_master_products(p_query text default null)
returns table (
  id uuid,
  name text,
  brand text,
  size text,
  barcode text,
  category_name text,
  image_path text,
  listings integer,
  shops integer,
  min_price_paise integer,
  max_price_paise integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.name, m.brand, m.size, m.barcode, c.name, m.image_path,
    count(v.id)::integer, count(distinct p.shop_id)::integer, min(v.price_paise)::integer, max(v.price_paise)::integer
  from public.master_products m
  left join public.categories c on c.id = m.category_id
  left join public.variants v on v.master_product_id = m.id
  left join public.products p on p.id = v.product_id
  where public.is_admin()
    and (nullif(trim(p_query), '') is null
      or m.name ilike '%' || trim(p_query) || '%'
      or m.barcode = trim(p_query))
  group by m.id, c.name
  order by m.name, m.size
  limit 200;
$$;

revoke all on function public.master_match_key(text, text) from public, anon, authenticated;
revoke all on function public.find_or_create_master(text, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.link_master_product() from public, anon, authenticated;
revoke all on function public.merge_master_products(uuid, uuid) from public, anon;
revoke all on function public.list_master_products(text) from public, anon;
grant execute on function public.merge_master_products(uuid, uuid) to authenticated;
grant execute on function public.list_master_products(text) to authenticated;
