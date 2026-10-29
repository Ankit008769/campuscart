-- Search results show product photos, and most photos are CC BY / CC BY-SA, so the search screen
-- needs each photo's credit too. The return type changes, so the function is dropped and recreated.

drop function public.search_products(text, uuid);

create function public.search_products(p_query text default null, p_category_id uuid default null)
returns table (
  id uuid,
  name text,
  image_path text,
  is_veg boolean,
  photo_credit text,
  photo_source_url text,
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
    p.id, p.name, p.image_path, p.is_veg, p.photo_credit, p.photo_source_url,
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

revoke all on function public.search_products(text, uuid) from public, anon;
grant execute on function public.search_products(text, uuid) to authenticated;
