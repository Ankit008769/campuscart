-- Unified catalog search (build session 3.2): each product once, however many shops sell it, with the
-- lowest price among shops that have it now. Students add it to the cart and route_cart picks the
-- shop. Typo-tolerant like search_products. Runs as the caller, so hidden items stay hidden.
create or replace function public.search_catalog(p_query text default null, p_category_id uuid default null)
returns table (
  master_product_id uuid,
  name text,
  size text,
  image_path text,
  photo_credit text,
  photo_source_url text,
  category_name text,
  min_price_paise integer,
  shops integer,
  available boolean
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (select nullif(trim(lower(p_query)), '') as text)
  select m.id, m.name, m.size, m.image_path, m.photo_credit, m.photo_source_url, c.name,
    (min(v.price_paise) filter (where v.in_stock and s.is_open))::integer,
    count(distinct p.shop_id)::integer,
    coalesce(bool_or(v.in_stock and s.is_open), false)
  from public.master_products m
  join public.variants v on v.master_product_id = m.id
  join public.products p on p.id = v.product_id and p.active
  join public.shops s on s.id = p.shop_id
  left join public.categories c on c.id = m.category_id
  cross join q
  where (p_category_id is null or m.category_id = p_category_id)
    and (
      q.text is null
      or lower(m.name) like '%' || q.text || '%'
      or word_similarity(q.text, lower(m.name)) > 0.5
    )
  group by m.id, c.name, q.text
  order by
    coalesce(bool_or(v.in_stock and s.is_open), false) desc,
    case when q.text is null then 0 else word_similarity(q.text, lower(m.name)) end desc,
    m.name, m.size
  limit 60;
$$;

revoke all on function public.search_catalog(text, uuid) from public, anon;
grant execute on function public.search_catalog(text, uuid) to authenticated;
