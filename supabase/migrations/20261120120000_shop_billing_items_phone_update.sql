-- Four fixes before 1.0.3: shops drop items they don't have instead of rejecting the whole order;
-- every order needs the student's mobile number, so the shop can call; admins see each shop's
-- monthly platform-fee bill; and the app can be told which version is the oldest still allowed.

-- 1. Items a shop doesn't have ---------------------------------------------------------------------
-- Before handing over, the shop's staff can take items off an order they can't supply. The order is
-- re-priced on what is left; fees never go up because of it (the shop ran out, not the student), and
-- a coupon is capped at the new item total. Those items are also marked out of stock, so the next
-- student doesn't hit the same gap, and the student gets a push with the new amount.
create or replace function public.remove_order_items(p_order_id uuid, p_item_ids uuid[])
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  v_removed text;
  v_left integer;
  v_subtotal integer;
  v_discount integer;
  v_shop text;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.shop_id not in (select public.my_shop_ids()) then
    raise exception 'Only this shop''s staff can change the order' using errcode = '42501';
  end if;
  if o.status not in ('placed', 'accepted') then
    raise exception 'Items can only be removed before the order is packed' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_item_ids, 1), 0) = 0 then
    raise exception 'Pick the items you don''t have' using errcode = '22023';
  end if;

  select count(*) into v_left from public.order_items where order_id = o.id and not (id = any (p_item_ids));
  if v_left = 0 then
    raise exception 'To drop every item, reject the order instead' using errcode = 'P0001';
  end if;

  update public.variants v set in_stock = false
  from public.order_items i
  where i.order_id = o.id and i.id = any (p_item_ids) and i.variant_id = v.id;

  with gone as (
    delete from public.order_items where order_id = o.id and id = any (p_item_ids)
    returning qty, name_snapshot
  )
  select string_agg(qty || ' × ' || name_snapshot, ', ') into v_removed from gone;
  if v_removed is null then
    raise exception 'Those items aren''t on this order' using errcode = 'P0002';
  end if;

  select sum(price_paise_snapshot * qty)::integer into v_subtotal from public.order_items where order_id = o.id;
  v_discount := least(o.discount_paise, v_subtotal);
  update public.orders
  set subtotal_paise = v_subtotal,
      discount_paise = v_discount,
      total_paise = v_subtotal + delivery_fee_paise + small_cart_fee_paise + platform_fee_paise + surcharge_paise - v_discount
  where id = o.id
  returning * into o;
  if o.cart_id is not null then
    update public.carts set total_paise = (select sum(total_paise) from public.orders where cart_id = o.cart_id)
    where id = o.cart_id;
  end if;

  select name into v_shop from public.shops where id = o.shop_id;
  insert into public.push_outbox (user_id, app, title, body, data)
  values (o.student_id, 'consumer', 'Some items weren''t available',
          v_shop || ' didn''t have ' || v_removed || '. Your order is now ' || public.rupees_text(o.total_paise) || '.',
          jsonb_build_object('orderId', o.id));
  return o;
end;
$$;

revoke all on function public.remove_order_items(uuid, uuid[]) from public, anon;
grant execute on function public.remove_order_items(uuid, uuid[]) to authenticated;

-- 2. A mobile number on every order ---------------------------------------------------------------
-- Shops call when something runs out or they're at the drop point. One trigger covers every way an
-- order is made (one shop, a multi-shop cart, a group order, the Print Store).
create or replace function public.require_student_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.student_id and nullif(trim(p.phone), '') is not null) then
    raise exception 'Add your mobile number in your profile before ordering, so the shop can call you' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.require_student_phone() from public, anon, authenticated;

create trigger require_student_phone
  before insert on public.orders
  for each row execute function public.require_student_phone();

-- 3. Each shop's monthly bill ----------------------------------------------------------------------
-- The ₹4 platform fee is paid to the shop at handover, so CampusCart collects it from the shop each
-- month: one row per shop for the month (Indian time) of p_month, counting completed orders only.
create or replace function public.shop_monthly_bills(p_month date)
returns table (shop_id uuid, shop_name text, orders integer, item_sales_paise integer, delivery_paise integer, platform_fee_paise integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := (date_trunc('month', p_month)::timestamp at time zone 'Asia/Kolkata');
  v_to timestamptz := ((date_trunc('month', p_month) + interval '1 month')::timestamp at time zone 'Asia/Kolkata');
begin
  if not public.is_admin() then
    raise exception 'Only admins can see shop bills' using errcode = '42501';
  end if;
  return query
    select s.id, s.name,
      count(o.id)::integer,
      coalesce(sum(o.subtotal_paise - o.discount_paise), 0)::integer,
      coalesce(sum(o.delivery_fee_paise + o.small_cart_fee_paise + o.surcharge_paise), 0)::integer,
      coalesce(sum(o.platform_fee_paise), 0)::integer
    from public.shops s
    left join public.orders o
      on o.shop_id = s.id and o.status in ('delivered', 'collected')
      and o.completed_at >= v_from and o.completed_at < v_to
    group by s.id, s.name
    order by coalesce(sum(o.platform_fee_paise), 0) desc, s.name;
end;
$$;

-- The orders behind one shop's bill, oldest first.
create or replace function public.shop_month_orders(p_shop_id uuid, p_month date)
returns table (order_id uuid, code text, token_no integer, completed_at timestamptz, mode public.order_mode, pay_method public.pay_method,
               item_sales_paise integer, platform_fee_paise integer, total_paise integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := (date_trunc('month', p_month)::timestamp at time zone 'Asia/Kolkata');
  v_to timestamptz := ((date_trunc('month', p_month) + interval '1 month')::timestamp at time zone 'Asia/Kolkata');
begin
  if not public.is_admin() then
    raise exception 'Only admins can see shop bills' using errcode = '42501';
  end if;
  return query
    select o.id, o.code, o.token_no, o.completed_at, o.mode, o.pay_method,
      (o.subtotal_paise - o.discount_paise)::integer, o.platform_fee_paise, o.total_paise
    from public.orders o
    where o.shop_id = p_shop_id and o.status in ('delivered', 'collected')
      and o.completed_at >= v_from and o.completed_at < v_to
    order by o.completed_at;
end;
$$;

revoke all on function public.shop_monthly_bills(date) from public, anon;
revoke all on function public.shop_month_orders(uuid, date) from public, anon;
grant execute on function public.shop_monthly_bills(date) to authenticated;
grant execute on function public.shop_month_orders(uuid, date) to authenticated;

-- 4. The oldest app version still allowed ------------------------------------------------------------
-- The app (1.0.3 on) reads this at start and asks for an update when its Android versionCode is lower.
-- 0 lets every version in; admins raise it once a new build is live on Play.
create table public.app_settings (
  id boolean primary key default true check (id),
  min_android_version_code integer not null default 0 check (min_android_version_code >= 0),
  updated_at timestamptz not null default now()
);
insert into public.app_settings default values;

alter table public.app_settings enable row level security;
create policy "anyone reads the app settings" on public.app_settings for select to anon, authenticated using (true);
create policy "admins change the app settings" on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.app_settings to anon, authenticated;
grant update (min_android_version_code, updated_at) on public.app_settings to authenticated;
