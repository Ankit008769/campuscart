-- Delivery fees by drop point and a night surcharge (build session 2.12).
--
-- calculate_bill stays as it is (it matches calculateBill). On top of it, delivery_surcharge adds a
-- drop point's own extra fee (a far hostel) and the night surcharge between 11 PM and 6 AM Indian
-- time, judged at the time the order will be delivered. packages/core/src/bill.ts has the same
-- rule as deliverySurcharge; db-tests compare them.

-- New fee keys: night_surcharge here, and rider_payout (what a rider earns, read by riders.sql).
alter table public.fee_rules drop constraint fee_rules_key_check;
alter table public.fee_rules add constraint fee_rules_key_check check (key in (
  'delivery_fee', 'small_cart_limit', 'small_cart_fee', 'platform_fee', 'rider_payout', 'night_surcharge'
));

alter table public.drop_points
  add column extra_delivery_fee_paise integer not null default 0 check (extra_delivery_fee_paise between 0 and 10000);

alter table public.orders add column surcharge_paise integer not null default 0 check (surcharge_paise >= 0);

alter table public.orders drop constraint orders_total_matches_bill;
alter table public.orders add constraint orders_total_matches_bill
  check (total_paise = subtotal_paise + delivery_fee_paise + small_cart_fee_paise + platform_fee_paise
                       + surcharge_paise - discount_paise);

create or replace function public.delivery_surcharge(p_mode public.order_mode, p_drop_point_id uuid, p_at timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select case when p_mode = 'pickup' then 0 else
    coalesce((select d.extra_delivery_fee_paise from public.drop_points d where d.id = p_drop_point_id), 0)
    + case
        when extract(hour from p_at at time zone 'Asia/Kolkata') >= 23
          or extract(hour from p_at at time zone 'Asia/Kolkata') < 6
        then coalesce((select f.value_paise from public.fee_rules f where f.key = 'night_surcharge'), 0)
        else 0
      end
  end;
$$;

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
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
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

  select * into v_bill from public.calculate_bill(v_subtotal, p_mode);

  if v_coupon is not null then
    -- Hold the coupon until this order commits, so concurrent orders can't overshoot its limits.
    perform 1 from public.coupons where code = v_coupon for update;
    v_discount := public.coupon_discount(v_coupon, v_user, p_shop_id, v_subtotal);
  end if;

  -- Far drop points and night deliveries cost extra, judged at the time it will be delivered.
  v_surcharge := public.delivery_surcharge(p_mode, p_drop_point_id, coalesce(p_scheduled_for, now()));

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
    discount_paise, coupon_code, surcharge_paise, total_paise, token_no, status, scheduled_for, release_at
  )
  values (
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    v_user, p_shop_id, p_mode, p_drop_point_id,
    case when p_mode = 'delivery' then coalesce(nullif(trim(p_room_note), ''), v_profile.room_note) end,
    p_pay_method,
    v_bill.subtotal_paise, v_bill.delivery_fee_paise, v_bill.small_cart_fee_paise, v_bill.platform_fee_paise,
    v_discount, case when v_discount > 0 then v_coupon end, v_surcharge,
    v_bill.total_paise - v_discount + v_surcharge, v_token,
    case when p_scheduled_for is null then 'placed' else 'scheduled' end::public.order_status,
    p_scheduled_for, v_release
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

  select * into v_bill from public.calculate_bill(v_job.price_paise, p_mode);
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

revoke all on function public.delivery_surcharge(public.order_mode, uuid, timestamptz) from public, anon, authenticated;
