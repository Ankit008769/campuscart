-- Search, live categories and account deletion requests (build sessions 1.4 and 1.5).

-- Search across every shop's active menu. Forgives typos ("magi" finds "Maggi") using pg_trgm.
-- Runs as the caller, so row-level security still decides what each person can see.
create or replace function public.search_products(p_query text default null, p_category_id uuid default null)
returns table (
  id uuid,
  name text,
  image_path text,
  is_veg boolean,
  shop_id uuid,
  shop_name text,
  shop_is_open boolean,
  category_name text,
  min_price_paise integer,
  in_stock boolean
)
language sql
stable
set search_path = public, extensions
as $$
  with q as (select nullif(trim(lower(p_query)), '') as text)
  select
    p.id, p.name, p.image_path, p.is_veg,
    s.id, s.name, s.is_open,
    c.name,
    min(v.price_paise)::integer,
    bool_or(v.in_stock)
  from public.products p
  join public.shops s on s.id = p.shop_id
  join public.variants v on v.product_id = p.id
  left join public.categories c on c.id = p.category_id
  cross join q
  where p.active
    and (p_category_id is null or p.category_id = p_category_id)
    and (
      q.text is null
      or lower(p.name) like '%' || q.text || '%'
      or word_similarity(q.text, lower(p.name)) > 0.5
    )
  group by p.id, s.id, c.name, q.text
  order by
    s.is_open desc,
    case when q.text is null then 0 else word_similarity(q.text, lower(p.name)) end desc,
    p.name
  limit 60;
$$;

-- Categories that have at least one active product, in menu order, for the home screen tiles.
create or replace function public.list_categories()
returns table (id uuid, name text, product_count integer)
language sql
stable
set search_path = ''
as $$
  select c.id, c.name, count(p.id)::integer
  from public.categories c
  join public.products p on p.category_id = c.id and p.active
  group by c.id
  order by min(c.sort), c.name;
$$;

-- Google Play requires an in-app way to ask for account deletion. Orders stay (shops and the
-- platform need their sales records), so a request wipes the person's contact details, blocks the
-- account, and leaves the rest for an admin to finish.
alter table public.profiles add column deletion_requested_at timestamptz;

create or replace function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  update public.profiles
  set deletion_requested_at = now(),
      phone = null,
      room_note = null,
      default_drop_point_id = null,
      blocked = true
  where id = (select auth.uid());
end;
$$;

revoke all on function public.search_products(text, uuid) from public, anon;
revoke all on function public.list_categories() from public, anon;
revoke all on function public.request_account_deletion() from public, anon;
grant execute on function public.search_products(text, uuid) to authenticated;
grant execute on function public.list_categories() to authenticated;
grant execute on function public.request_account_deletion() to authenticated;
