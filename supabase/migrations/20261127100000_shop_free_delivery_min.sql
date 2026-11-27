-- A shop can set its own minimum for free delivery (25 Nov 2026: SP Shop delivers free from ₹300,
-- while CampusCart's usual minimum stays in fee_rules.small_cart_limit). Below a shop's minimum, a
-- delivery pays the usual small-cart fee. Null means the usual minimum.

alter table public.shops
  add column free_delivery_min_paise integer check (free_delivery_min_paise between 0 and 500000);

comment on column public.shops.free_delivery_min_paise is
  'Item total from which this shop''s deliveries are free; null uses fee_rules.small_cart_limit.';

-- The bill, now for a shop: its own free-delivery minimum when it has one. Callers that don't name a
-- shop get the usual minimum, as before. (Same rule as calculateBill in packages/core/src/bill.ts.)
drop function public.calculate_bill(integer, public.order_mode);

create or replace function public.calculate_bill(
  p_subtotal_paise integer,
  p_mode public.order_mode,
  p_shop_id uuid default null
)
returns table (
  subtotal_paise integer,
  delivery_fee_paise integer,
  small_cart_fee_paise integer,
  platform_fee_paise integer,
  total_paise integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_delivery integer := coalesce((select f.value_paise from public.fee_rules f where f.key = 'delivery_fee'), 1500);
  v_limit integer := coalesce(
    (select s.free_delivery_min_paise from public.shops s where s.id = p_shop_id),
    (select f.value_paise from public.fee_rules f where f.key = 'small_cart_limit'),
    9900
  );
  v_small integer := coalesce((select f.value_paise from public.fee_rules f where f.key = 'small_cart_fee'), 1000);
  v_platform integer := coalesce((select f.value_paise from public.fee_rules f where f.key = 'platform_fee'), 400);
  v_has_items boolean := p_subtotal_paise > 0;
  v_delivering boolean := v_has_items and p_mode = 'delivery';
begin
  subtotal_paise := p_subtotal_paise;
  delivery_fee_paise := case when v_delivering then v_delivery else 0 end;
  small_cart_fee_paise := case when v_delivering and p_subtotal_paise < v_limit then v_small else 0 end;
  platform_fee_paise := case when v_has_items then v_platform else 0 end;
  total_paise := subtotal_paise + delivery_fee_paise + small_cart_fee_paise + platform_fee_paise;
  return next;
end;
$$;

revoke all on function public.calculate_bill(integer, public.order_mode, uuid) from public, anon;
grant execute on function public.calculate_bill(integer, public.order_mode, uuid) to authenticated;

-- Every order is priced in place_shop_order, cart fees move in reassign_cart_fees and print orders in
-- place_print_order: each now passes its shop. Otherwise unchanged.
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

  select * into v_bill from public.calculate_bill(coalesce(p_fee_basis_paise, v_subtotal), p_mode, p_shop_id);
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
      select * into v_bill from public.calculate_bill(v_open_subtotal, o.mode, v_next.shop_id);
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

create or replace function public.place_print_order(
  p_job_id uuid,
  p_mode public.order_mode,
  p_pay_method public.pay_method,
  p_drop_point_id uuid default null,
  p_room_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_profile public.profiles;
  v_job public.print_jobs;
  v_shop public.shops;
  v_bill record;
  v_surcharge integer;
  v_token integer;
  v_order public.orders;
begin
  select * into v_profile from public.profiles where id = v_user;
  if not found or v_profile.blocked then
    raise exception 'This account cannot place orders' using errcode = '42501';
  end if;
  select * into v_job from public.print_jobs where id = p_job_id and student_id = v_user for update;
  if not found then
    raise exception 'Print job not found' using errcode = 'P0002';
  end if;
  if v_job.order_id is not null then
    raise exception 'This print job is already ordered' using errcode = 'P0001';
  end if;
  if v_job.price_paise is null then
    raise exception 'The file is still being checked. Try again in a moment.' using errcode = 'P0001';
  end if;
  if v_job.file_deleted_at is not null or v_job.created_at < now() - interval '1 day' then
    raise exception 'This file has expired. Upload it again.' using errcode = 'P0001';
  end if;

  select * into v_shop from public.shops where id = v_job.shop_id;
  if not v_shop.is_open then
    raise exception 'This shop is closed right now' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.print_settings where shop_id = v_shop.id and active) then
    raise exception 'This shop does not take print orders' using errcode = 'P0001';
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

  select * into v_bill from public.calculate_bill(v_job.price_paise, p_mode, v_job.shop_id);
  v_surcharge := public.delivery_surcharge(p_mode, p_drop_point_id, now());

  insert into public.shop_daily_counters as c (shop_id, day, last_token)
  values (v_shop.id, (now() at time zone 'Asia/Kolkata')::date, 1)
  on conflict (shop_id, day) do update set last_token = c.last_token + 1
  returning c.last_token into v_token;

  insert into public.orders (
    code, student_id, shop_id, mode, drop_point_id, room_note, pay_method,
    subtotal_paise, delivery_fee_paise, small_cart_fee_paise, platform_fee_paise, surcharge_paise, total_paise, token_no
  )
  values (
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    v_user, v_shop.id, p_mode, p_drop_point_id,
    case when p_mode = 'delivery' then coalesce(nullif(trim(p_room_note), ''), v_profile.room_note) end,
    p_pay_method,
    v_bill.subtotal_paise, v_bill.delivery_fee_paise, v_bill.small_cart_fee_paise,
    v_bill.platform_fee_paise, v_surcharge, v_bill.total_paise + v_surcharge, v_token
  )
  returning * into v_order;

  insert into public.order_items (order_id, variant_id, name_snapshot, price_paise_snapshot, qty)
  values (
    v_order.id, null,
    left('Printout: ' || v_job.file_name, 80) || ' (' || v_job.pages || ' pages'
      || case when v_job.copies > 1 then ' × ' || v_job.copies || ' copies' else '' end
      || ', ' || case when v_job.color then 'colour' else 'black and white' end
      || case when v_job.double_sided then ', both sides' else '' end || ')',
    v_job.price_paise, 1
  );
  update public.print_jobs set order_id = v_order.id where id = v_job.id;

  insert into public.order_secrets (order_id, delivery_otp)
  values (v_order.id, lpad(floor(random() * 10000)::integer::text, 4, '0'));
  insert into public.order_events (order_id, from_status, to_status, actor, actor_id)
  values (v_order.id, null, 'placed', 'student', v_user);
  return v_order;
end;
$$;
