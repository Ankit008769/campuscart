-- Shop catalog editing (build session 1.9).
--
-- save_product writes an item and all its variants in one transaction, so a half-saved item never
-- reaches students. It runs as the caller, so the catalog's row-level security decides who may
-- change what: staff edit their own shop, admins any shop, students nothing.

-- p_product_id null adds a new item; p_is_veg null means the shop hasn't said.
create or replace function public.save_product(
  p_shop_id uuid,
  p_name text,
  p_variants jsonb,
  p_product_id uuid default null,
  p_description text default '',
  p_category_id uuid default null,
  p_is_veg boolean default null,
  p_image_path text default null,
  p_active boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_product_id;
  v_name text := nullif(trim(p_name), '');
  v_old_image text;
  v_variant jsonb;
  v_sort integer := 0;
  v_variant_id uuid;
  v_label text;
  v_price integer;
  v_mrp integer;
  v_kept uuid[] := '{}';
begin
  -- Row-level security enforces this too; checking first gives a clear message, because staff can
  -- see other shops' active items and would otherwise fail halfway with a policy error.
  if not (p_shop_id in (select public.my_shop_ids()) or public.is_admin()) then
    raise exception 'You can only change your own shop''s items' using errcode = '42501';
  end if;
  if v_name is null or length(v_name) > 80 then
    raise exception 'Give the item a name of up to 80 letters' using errcode = '22023';
  end if;
  if jsonb_typeof(p_variants) is distinct from 'array'
     or jsonb_array_length(p_variants) not between 1 and 10 then
    raise exception 'An item needs 1 to 10 sizes or prices' using errcode = '22023';
  end if;

  -- Check every variant before writing anything, so errors name the size the shop typed.
  for v_variant in select value from jsonb_array_elements(p_variants) loop
    v_label := coalesce(trim(v_variant ->> 'label'), '');
    v_price := (v_variant ->> 'price_paise')::integer;
    v_mrp := (v_variant ->> 'mrp_paise')::integer;
    if length(v_label) > 40 then
      raise exception 'Size names are up to 40 letters' using errcode = '22023';
    end if;
    if v_price is null or v_mrp is null or v_price <= 0 or v_mrp <= 0 then
      raise exception 'Every size needs a price and an MRP above zero' using errcode = '22023';
    end if;
    if v_price > v_mrp then
      raise exception 'The price of % cannot be above its MRP', coalesce(nullif(v_label, ''), v_name)
        using errcode = '22023';
    end if;
  end loop;

  if v_id is null then
    insert into public.products (shop_id, category_id, name, description, is_veg, image_path, active)
    values (p_shop_id, p_category_id, v_name, coalesce(trim(p_description), ''), p_is_veg, p_image_path,
            coalesce(p_active, true))
    returning id into v_id;
  else
    select image_path into v_old_image from public.products where id = v_id and shop_id = p_shop_id for update;
    if not found then
      raise exception 'Item not found' using errcode = 'P0002';
    end if;
    update public.products set
      category_id = p_category_id,
      name = v_name,
      description = coalesce(trim(p_description), ''),
      is_veg = p_is_veg,
      image_path = p_image_path,
      active = coalesce(p_active, true),
      -- A shop's own photo replaces a credited stock photo, so its credit goes too.
      photo_credit = case when p_image_path is distinct from v_old_image then null else photo_credit end,
      photo_source_url = case when p_image_path is distinct from v_old_image then null else photo_source_url end
    where id = v_id;
  end if;

  for v_variant in select value from jsonb_array_elements(p_variants) loop
    v_sort := v_sort + 1;
    v_variant_id := nullif(v_variant ->> 'id', '')::uuid;
    if v_variant_id is null then
      insert into public.variants (product_id, label, price_paise, mrp_paise, in_stock, sort)
      values (v_id, coalesce(trim(v_variant ->> 'label'), ''), (v_variant ->> 'price_paise')::integer,
              (v_variant ->> 'mrp_paise')::integer, coalesce((v_variant ->> 'in_stock')::boolean, true), v_sort)
      returning id into v_variant_id;
    else
      update public.variants set
        label = coalesce(trim(v_variant ->> 'label'), ''),
        price_paise = (v_variant ->> 'price_paise')::integer,
        mrp_paise = (v_variant ->> 'mrp_paise')::integer,
        in_stock = coalesce((v_variant ->> 'in_stock')::boolean, true),
        sort = v_sort
      where id = v_variant_id and product_id = v_id;
      if not found then
        raise exception 'That size no longer exists. Reopen the item and try again.' using errcode = 'P0002';
      end if;
    end if;
    v_kept := v_kept || v_variant_id;
  end loop;

  -- Sizes the shop removed. Past bills keep their own copy of names and prices.
  delete from public.variants where product_id = v_id and id <> all (v_kept);

  return v_id;
end;
$$;

-- Marks every size of every item in one category of a shop in or out of stock ("no Maggi tonight").
-- Returns how many sizes changed.
-- p_category_id null means the shop's uncategorised items.
create or replace function public.set_category_in_stock(p_shop_id uuid, p_in_stock boolean, p_category_id uuid default null)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with changed as (
    update public.variants v
    set in_stock = p_in_stock
    from public.products p
    where p.id = v.product_id
      and p.shop_id = p_shop_id
      and p.category_id is not distinct from p_category_id
      and v.in_stock is distinct from p_in_stock
    returning v.id
  )
  select count(*)::integer from changed;
$$;

revoke all on function public.save_product(uuid, text, jsonb, uuid, text, uuid, boolean, text, boolean) from public, anon;
revoke all on function public.set_category_in_stock(uuid, boolean, uuid) from public, anon;
grant execute on function public.save_product(uuid, text, jsonb, uuid, text, uuid, boolean, text, boolean) to authenticated;
grant execute on function public.set_category_in_stock(uuid, boolean, uuid) to authenticated;
