-- One cart across shops (build sessions 3.2 and 3.3).
--
-- place_cart routes every item to a shop, then places one order per shop, all in one cart. The
-- cart pays its fees once: the order with the largest item total carries the delivery, small-cart
-- and platform fees and any surcharge, worked out on the whole cart's item total (the same
-- calculate_bill as a one-shop order); the other shops' orders carry none. If that order is
-- rejected, cancelled or expires, the fees move to the largest order still open, recomputed for
-- what is left, so the rest of the cart carries on. "One payment" waits for online payments.
--
-- Routing (route_cart, shared by the cart preview and place_cart): an item several shops sell goes
-- to an open shop with it in stock and the earliest ETA (prep, rush and walk time). A shop already
-- in the cart wins when it is within 5 minutes of the earliest; then the lower price.

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id),
  mode public.order_mode not null,
  drop_point_id uuid references public.drop_points (id),
  -- What the open and completed orders add up to; failed shop orders drop out.
  total_paise integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.orders add column cart_id uuid references public.carts (id);
create index orders_cart_idx on public.orders (cart_id) where cart_id is not null;

alter table public.carts enable row level security;
create policy "students read their own carts" on public.carts
  for select to authenticated using (student_id = (select auth.uid()) or public.is_admin());
grant select on public.carts to authenticated;

-- Riders earn the same for a fee-free order in a cart as for any other delivery.
create or replace function public.rider_payout_for(p_order public.orders)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select f.value_paise from public.fee_rules f where f.key = 'rider_payout'),
    nullif(p_order.delivery_fee_paise, 0),
    (select f.value_paise from public.fee_rules f where f.key = 'delivery_fee'),
    1500
  );
$$;

-- The internal order maker, shared by place_order (one shop) and place_cart (one per shop).
-- Not granted to anyone: it trusts p_student, p_charge_fees and p_fee_basis_paise.
create or replace function public.place_shop_order(
  p_student uuid,
  p_shop_id uuid,
  p_mode public.order_mode,
  p_pay_method public.pay_method,
  p_items jsonb,
  p_drop_point_id uuid,
  p_room_note text,
  p_coupon_code text,
  p_scheduled_for timestamptz,
  p_cart_id uuid,
  -- False for the other shops' orders in a cart: the cart pays its fees once.
  p_charge_fees boolean,
  -- What the fees are worked out on: the whole cart's item total, or null for this order's own.
  p_fee_basis_paise integer
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := p_student;
  v_profile public.profiles;
  v_shop public.shops;
  v_requested integer;
  v_in_shop integer;
  v_available integer;
  v_too_many integer;
  v_subtotal integer;
  v_bill record;
  v_coupon text := nullif(upper(trim(p_coupon_code)), '');
  v_discount integer := 0;
  v_surcharge integer := 0;
  v_delivery integer;
  v_small integer;
  v_platform integer;
  v_token integer := 0;
  v_problem text;
  v_release timestamptz;
  v_order public.orders;
begin
  if v_user is null then
    raise exception 'Sign in to place an order' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_user;
  if not found or v_profile.blocked then
    raise exception 'This account cannot place orders' using errcode = '42501';
  end if;

  select * into v_shop from public.shops where id = p_shop_id;
  if not found then
    raise exception 'Shop not found' using errcode = 'P0002';
  end if;
  if p_mode = 'delivery' and not v_shop.does_delivery then
    raise exception 'This shop does not deliver' using errcode = 'P0001';
  end if;
  if p_mode = 'pickup' and not v_shop.does_pickup then
    raise exception 'This shop does not offer pickup' using errcode = 'P0001';
  end if;

  if p_mode = 'delivery' then
    if not exists (select 1 from public.drop_points where id = p_drop_point_id and active) then
      raise exception 'Choose where to deliver' using errcode = 'P0001';
    end if;
  else
    p_drop_point_id := null;
  end if;

  if p_scheduled_for is null then
    if not v_shop.is_open then
      raise exception 'This shop is closed right now' using errcode = 'P0001';
    end if;
  else
    -- Whether the shop is open is checked when the order is released to it.
    v_problem := public.schedule_problem(p_shop_id, p_mode, p_drop_point_id, p_scheduled_for, now());
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'P0001';
    end if;
    v_release := p_scheduled_for
      - make_interval(mins => v_shop.prep_minutes + public.walk_minutes(p_shop_id, p_mode, p_drop_point_id));
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as i(variant_id uuid, qty integer)
    where i.variant_id is null or i.qty is null or i.qty < 1 or i.qty > 50
  ) then
    raise exception 'Each item needs a quantity from 1 to 50' using errcode = 'P0001';
  end if;

  with requested as (
    select i.variant_id, sum(i.qty)::integer as qty
    from jsonb_to_recordset(p_items) as i(variant_id uuid, qty integer)
    group by i.variant_id
  )
  select
    count(*),
    count(*) filter (where p.shop_id = p_shop_id),
    count(*) filter (where p.shop_id = p_shop_id and p.active and v.in_stock),
    count(*) filter (where r.qty > 50),
    coalesce(sum(v.price_paise * r.qty) filter (where p.shop_id = p_shop_id), 0)
  into v_requested, v_in_shop, v_available, v_too_many, v_subtotal
  from requested r
  left join public.variants v on v.id = r.variant_id
  left join public.products p on p.id = v.product_id;

  if v_in_shop < v_requested then
    raise exception 'An item in your cart is not sold by this shop' using errcode = 'P0001';
  end if;
  if v_available < v_requested then
    raise exception 'Some items in your cart are out of stock' using errcode = 'P0001';
  end if;
  if v_too_many > 0 then
    raise exception 'Each item needs a quantity from 1 to 50' using errcode = 'P0001';
  end if;

  select * into v_bill from public.calculate_bill(coalesce(p_fee_basis_paise, v_subtotal), p_mode);
  v_delivery := case when p_charge_fees then v_bill.delivery_fee_paise else 0 end;
  v_small := case when p_charge_fees then v_bill.small_cart_fee_paise else 0 end;
  v_platform := case when p_charge_fees then v_bill.platform_fee_paise else 0 end;

  if v_coupon is not null then
    -- Hold the coupon until this order commits, so concurrent orders can't overshoot its limits.
    perform 1 from public.coupons where code = v_coupon for update;
    v_discount := public.coupon_discount(v_coupon, v_user, p_shop_id, v_subtotal);
  end if;

  -- Far drop points and night deliveries cost extra, judged at the time it will be delivered.
  if p_charge_fees then
    v_surcharge := public.delivery_surcharge(p_mode, p_drop_point_id, coalesce(p_scheduled_for, now()));
  end if;

  -- Tokens count per shop per day, so a scheduled order gets its token on the day it is released.
  if p_scheduled_for is null then
    insert into public.shop_daily_counters as c (shop_id, day, last_token)
    values (p_shop_id, (now() at time zone 'Asia/Kolkata')::date, 1)
    on conflict (shop_id, day) do update set last_token = c.last_token + 1
    returning c.last_token into v_token;
  end if;

  insert into public.orders (
    code, student_id, shop_id, mode, drop_point_id, room_note, pay_method,
    subtotal_paise, delivery_fee_paise, small_cart_fee_paise, platform_fee_paise,
    discount_paise, coupon_code, surcharge_paise, total_paise, token_no, status, scheduled_for, release_at, cart_id
  )
  values (
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    v_user, p_shop_id, p_mode, p_drop_point_id,
    case when p_mode = 'delivery' then coalesce(nullif(trim(p_room_note), ''), v_profile.room_note) end,
    p_pay_method,
    v_subtotal, v_delivery, v_small, v_platform,
    v_discount, case when v_discount > 0 then v_coupon end, v_surcharge,
    v_subtotal + v_delivery + v_small + v_platform - v_discount + v_surcharge, v_token,
    case when p_scheduled_for is null then 'placed' else 'scheduled' end::public.order_status,
    p_scheduled_for, v_release, p_cart_id
  )
  returning * into v_order;

  insert into public.order_items (order_id, variant_id, name_snapshot, price_paise_snapshot, qty)
  select
    v_order.id,
    v.id,
    p.name || case when v.label <> '' then ' (' || v.label || ')' else '' end,
    v.price_paise,
    r.qty
  from (
    select i.variant_id, sum(i.qty)::integer as qty
    from jsonb_to_recordset(p_items) as i(variant_id uuid, qty integer)
    group by i.variant_id
  ) r
  join public.variants v on v.id = r.variant_id
  join public.products p on p.id = v.product_id;

  -- A price edit between the two reads above would make the bill disagree with its items.
  if (select sum(price_paise_snapshot * qty) from public.order_items where order_id = v_order.id) <> v_subtotal then
    raise exception 'Prices just changed. Check your cart and order again.' using errcode = 'P0001';
  end if;

  if v_discount > 0 then
    insert into public.coupon_redemptions (order_id, coupon_code, student_id, discount_paise)
    values (v_order.id, v_coupon, v_user, v_discount);
  end if;

  insert into public.order_secrets (order_id, delivery_otp)
  values (v_order.id, lpad(floor(random() * 10000)::integer::text, 4, '0'));

  insert into public.order_events (order_id, from_status, to_status, actor, actor_id)
  values (v_order.id, null, v_order.status, 'student', v_user);

  return v_order;
end;
$$;

-- One-shop orders, exactly as before: the signed-in student, fees on this order's own items.
create or replace function public.place_order(
  p_shop_id uuid,
  p_mode public.order_mode,
  p_pay_method public.pay_method,
  p_items jsonb,
  p_drop_point_id uuid default null,
  p_room_note text default null,
  p_coupon_code text default null,
  p_scheduled_for timestamptz default null
)
returns public.orders
language sql
security definer
set search_path = ''
as $$
  select * from public.place_shop_order(
    (select auth.uid()), p_shop_id, p_mode, p_pay_method, p_items, p_drop_point_id, p_room_note,
    p_coupon_code, p_scheduled_for, null, true, null
  );
$$;

-- Where each cart line would be bought. Lines are {"variant_id", "qty"} for a shop's own size or
-- {"master_product_id", "qty"} to let CampusCart pick the shop. problem says why a line can't be
-- bought now; otherwise it names the shop, the size and today's price.
create or replace function public.route_cart(p_items jsonb, p_mode public.order_mode, p_drop_point_id uuid default null)
returns table (
  line integer,
  master_product_id uuid,
  variant_id uuid,
  shop_id uuid,
  shop_name text,
  product_name text,
  price_paise integer,
  qty integer,
  problem text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_in_cart uuid[] := '{}';
  v_item record;
  v_pick record;
  v_name text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty' using errcode = 'P0001';
  end if;

  -- A shop's own sizes first: their shops are in the cart whatever happens.
  for v_item in
    select n::integer as n, (value ->> 'variant_id')::uuid as vid, (value ->> 'qty')::integer as q
    from jsonb_array_elements(p_items) with ordinality as e(value, n)
    where value ? 'variant_id'
  loop
    select v.id, v.master_product_id as mid, p.shop_id as sid, s.name as sname, p.name as pname, v.price_paise as price,
      (p.active and v.in_stock and s.is_open
        and ((p_mode = 'delivery' and s.does_delivery) or (p_mode = 'pickup' and s.does_pickup))) as ok
    into v_pick
    from public.variants v
    join public.products p on p.id = v.product_id
    join public.shops s on s.id = p.shop_id
    where v.id = v_item.vid;
    line := v_item.n; qty := v_item.q; variant_id := v_item.vid;
    if v_pick.id is null then
      master_product_id := null; shop_id := null; shop_name := null; product_name := null; price_paise := null;
      problem := 'An item in your cart is no longer sold';
    else
      master_product_id := v_pick.mid; shop_id := v_pick.sid; shop_name := v_pick.sname;
      product_name := v_pick.pname; price_paise := v_pick.price;
      problem := case when v_pick.ok then null else v_pick.pname || ' is not available at ' || v_pick.sname || ' right now' end;
      v_in_cart := v_in_cart || v_pick.sid;
    end if;
    return next;
  end loop;

  -- Then the items CampusCart routes, one at a time, so each sees the shops already chosen.
  for v_item in
    select n::integer as n, (value ->> 'master_product_id')::uuid as mid, (value ->> 'qty')::integer as q
    from jsonb_array_elements(p_items) with ordinality as e(value, n)
    where value ? 'master_product_id'
    order by n
  loop
    select c.* into v_pick
    from (
      select v.id as vid, p.shop_id as sid, s.name as sname, p.name as pname, v.price_paise as price,
        s.prep_minutes + case when s.rush_until > now() then s.rush_extra_minutes else 0 end
          + public.walk_minutes(s.id, p_mode, p_drop_point_id) as eta
      from public.variants v
      join public.products p on p.id = v.product_id
      join public.shops s on s.id = p.shop_id
      where v.master_product_id = v_item.mid and p.active and v.in_stock and s.is_open
        and ((p_mode = 'delivery' and s.does_delivery) or (p_mode = 'pickup' and s.does_pickup))
    ) c
    order by (c.sid = any (v_in_cart) and c.eta <= (min(c.eta) over ()) + 5) desc, c.eta, c.price, c.vid
    limit 1;

    line := v_item.n; qty := v_item.q; master_product_id := v_item.mid;
    if v_pick.vid is null then
      select m.name into v_name from public.master_products m where m.id = v_item.mid;
      variant_id := null; shop_id := null; shop_name := null; product_name := v_name; price_paise := null;
      problem := coalesce(v_name, 'An item') || ' is not available at any open shop right now';
    else
      variant_id := v_pick.vid; shop_id := v_pick.sid; shop_name := v_pick.sname;
      product_name := v_pick.pname; price_paise := v_pick.price; problem := null;
      v_in_cart := v_in_cart || v_pick.sid;
    end if;
    return next;
  end loop;
end;
$$;

-- Places a whole cart: routes it, makes the cart, and one order per shop. All or nothing: if any
-- shop's order can't be placed, none is.
create or replace function public.place_cart(
  p_items jsonb,
  p_mode public.order_mode,
  p_pay_method public.pay_method,
  p_drop_point_id uuid default null,
  p_room_note text default null,
  p_coupon_code text default null
)
returns public.carts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_routes jsonb;
  v_problems text;
  v_cart public.carts;
  v_cart_subtotal integer;
  v_primary uuid;
  v_shop record;
  v_order public.orders;
begin
  if v_user is null then
    raise exception 'Sign in to place an order' using errcode = '42501';
  end if;
  select jsonb_agg(to_jsonb(r) order by r.line), string_agg(r.problem, '; ')
  into v_routes, v_problems
  from public.route_cart(p_items, p_mode, p_drop_point_id) r;
  if v_problems is not null then
    raise exception '%', v_problems using errcode = 'P0001';
  end if;

  select sum(r.price_paise * r.qty)::integer into v_cart_subtotal
  from jsonb_to_recordset(v_routes) as r(shop_id uuid, price_paise integer, qty integer);
  select r.shop_id into v_primary
  from jsonb_to_recordset(v_routes) as r(shop_id uuid, price_paise integer, qty integer)
  group by r.shop_id
  order by sum(r.price_paise * r.qty) desc, r.shop_id
  limit 1;

  insert into public.carts (student_id, mode, drop_point_id)
  values (v_user, p_mode, case when p_mode = 'delivery' then p_drop_point_id end)
  returning * into v_cart;

  for v_shop in
    select r.shop_id, jsonb_agg(jsonb_build_object('variant_id', r.variant_id, 'qty', r.qty)) as items
    from jsonb_to_recordset(v_routes) as r(shop_id uuid, variant_id uuid, qty integer)
    group by r.shop_id
    order by (r.shop_id = v_primary) desc, r.shop_id
  loop
    v_order := public.place_shop_order(
      v_user, v_shop.shop_id, p_mode, p_pay_method, v_shop.items, p_drop_point_id, p_room_note,
      case when v_shop.shop_id = v_primary then p_coupon_code end, null,
      v_cart.id, v_shop.shop_id = v_primary, v_cart_subtotal
    );
  end loop;

  update public.carts set total_paise = (select sum(total_paise) from public.orders where cart_id = v_cart.id)
  where id = v_cart.id
  returning * into v_cart;
  return v_cart;
end;
$$;

-- Partial fulfilment: when the order carrying a cart's fees fails, the largest open order takes
-- them over, recomputed on what is left. The cart's total follows the orders still standing.
create or replace function public.reassign_cart_fees()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  v_next public.orders;
  v_open_subtotal integer;
  v_bill record;
  v_surcharge integer;
begin
  if new.to_status not in ('rejected', 'cancelled', 'expired') then
    return new;
  end if;
  select * into o from public.orders where id = new.order_id;
  if o.cart_id is null then
    return new;
  end if;

  if o.delivery_fee_paise + o.small_cart_fee_paise + o.platform_fee_paise + o.surcharge_paise > 0 then
    select coalesce(sum(subtotal_paise), 0)::integer into v_open_subtotal
    from public.orders
    where cart_id = o.cart_id and id <> o.id
      and status not in ('delivered', 'collected', 'rejected', 'cancelled', 'expired');
    if v_open_subtotal > 0 then
      select * into v_next from public.orders
      where cart_id = o.cart_id and id <> o.id
        and status not in ('delivered', 'collected', 'rejected', 'cancelled', 'expired')
      order by subtotal_paise desc, placed_at, id
      limit 1
      for update;
      select * into v_bill from public.calculate_bill(v_open_subtotal, o.mode);
      v_surcharge := public.delivery_surcharge(o.mode, o.drop_point_id, now());
      update public.orders set
        delivery_fee_paise = v_bill.delivery_fee_paise,
        small_cart_fee_paise = v_bill.small_cart_fee_paise,
        platform_fee_paise = v_bill.platform_fee_paise,
        surcharge_paise = v_surcharge,
        total_paise = subtotal_paise + v_bill.delivery_fee_paise + v_bill.small_cart_fee_paise
          + v_bill.platform_fee_paise + v_surcharge - discount_paise
      where id = v_next.id;
    end if;
  end if;

  update public.carts set total_paise = coalesce((
    select sum(total_paise) from public.orders
    where cart_id = o.cart_id and status not in ('rejected', 'cancelled', 'expired')
  ), 0)
  where id = o.cart_id;
  return new;
end;
$$;

create trigger reassign_cart_fees
  after insert on public.order_events
  for each row execute function public.reassign_cart_fees();

revoke all on function public.place_shop_order(uuid, uuid, public.order_mode, public.pay_method, jsonb, uuid, text, text, timestamptz, uuid, boolean, integer) from public, anon, authenticated;
revoke all on function public.route_cart(jsonb, public.order_mode, uuid) from public, anon;
revoke all on function public.place_cart(jsonb, public.order_mode, public.pay_method, uuid, text, text) from public, anon;
revoke all on function public.reassign_cart_fees() from public, anon, authenticated;
grant execute on function public.route_cart(jsonb, public.order_mode, uuid) to authenticated;
grant execute on function public.place_cart(jsonb, public.order_mode, public.pay_method, uuid, text, text) to authenticated;
