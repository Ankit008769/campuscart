-- Scheduled delivery and pickup (build session 2.10).
--
-- A student picks a slot. The order waits as 'scheduled', unseen by the shop, until the slot time
-- minus the shop's prep time and the walk to the drop point (release_at). release_scheduled_orders
-- then hands it to the shop as an ordinary new order, with that day's pickup token, or cancels it
-- if the shop isn't open. The same slot rules live in packages/core/src/schedule.ts (db-tests
-- compare them), and can_transition matches canTransition in packages/core/src/orders.ts.

alter table public.orders
  add column scheduled_for timestamptz,
  add column release_at timestamptz,
  add column released_at timestamptz,
  add constraint orders_scheduled_has_release check ((scheduled_for is null) = (release_at is null));
create index orders_scheduled_release_idx on public.orders (release_at) where status = 'scheduled';

create or replace function public.can_transition(
  p_from public.order_status,
  p_to public.order_status,
  p_mode public.order_mode,
  p_actor text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from in ('delivered', 'collected', 'rejected', 'cancelled', 'expired') then false
    -- Admins may cancel any open order.
    when p_to = 'cancelled' and p_actor = 'admin' then true
    when not (
      (p_from = 'scheduled' and p_to in ('placed', 'cancelled'))
      or (p_from = 'placed' and p_to in ('accepted', 'rejected', 'cancelled', 'expired'))
      or (p_from = 'accepted' and p_to in ('ready', 'cancelled'))
      or (p_from = 'ready' and p_to in ('out_for_delivery', 'collected'))
      or (p_from = 'out_for_delivery' and p_to = 'delivered')
    ) then false
    when p_to = 'out_for_delivery' and p_mode <> 'delivery' then false
    when p_to = 'collected' and p_mode <> 'pickup' then false
    -- A scheduled order: the student, or the system when the shop is closed at release time.
    -- Otherwise students cancel only before the shop accepts; after that only the shop can.
    when p_to = 'cancelled' then
      case
        when p_from = 'scheduled' then p_actor in ('student', 'system')
        when p_from = 'placed' then p_actor = 'student'
        else p_actor = 'shop'
      end
    -- Only the system releases a scheduled order to the shop.
    when p_to = 'placed' then p_actor = 'system'
    when p_to in ('accepted', 'rejected', 'ready', 'collected') then p_actor = 'shop'
    when p_to in ('out_for_delivery', 'delivered') then p_actor in ('shop', 'rider')
    when p_to = 'expired' then p_actor = 'system'
    else false
  end;
$$;

-- Minutes from the shop to the drop point: none for pickup, the measured walk_times entry, or 10.
create or replace function public.walk_minutes(p_shop_id uuid, p_mode public.order_mode, p_drop_point_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select case when p_mode = 'pickup' then 0 else coalesce(
    (select w.minutes from public.walk_times w where w.shop_id = p_shop_id and w.drop_point_id = p_drop_point_id),
    10
  ) end;
$$;

-- Why a slot can't be booked, or null if it can. Same checks, in the same order, as slotProblem.
create or replace function public.schedule_problem(
  p_shop_id uuid,
  p_mode public.order_mode,
  p_drop_point_id uuid,
  p_slot timestamptz,
  p_now timestamptz
)
returns text
language sql
stable
set search_path = ''
as $$
  with s as (
    select sh.hours,
      p_slot - make_interval(mins => sh.prep_minutes + public.walk_minutes(p_shop_id, p_mode, p_drop_point_id)) as release
    from public.shops sh where sh.id = p_shop_id
  )
  select case
    when extract(second from p_slot at time zone 'UTC') <> 0
      or extract(minute from p_slot at time zone 'UTC')::integer % 15 <> 0 then 'Pick one of the listed times'
    when s.release < p_now + interval '10 minutes' then 'That time is too soon. Order now instead'
    when p_slot > p_now + interval '2 days' then 'You can schedule up to 2 days ahead'
    when not public.within_shop_hours(s.hours, s.release) then 'The shop is closed at that time'
  end
  from s;
$$;

-- place_order gains p_scheduled_for. The signature changes, so the old one goes first.
drop function public.place_order(uuid, public.order_mode, public.pay_method, jsonb, uuid, text, text);

create function public.place_order(
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
    discount_paise, coupon_code, total_paise, token_no, status, scheduled_for, release_at
  )
  values (
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    v_user, p_shop_id, p_mode, p_drop_point_id,
    case when p_mode = 'delivery' then coalesce(nullif(trim(p_room_note), ''), v_profile.room_note) end,
    p_pay_method,
    v_bill.subtotal_paise, v_bill.delivery_fee_paise, v_bill.small_cart_fee_paise, v_bill.platform_fee_paise,
    v_discount, case when v_discount > 0 then v_coupon end, v_bill.total_paise - v_discount, v_token,
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

-- A released order gets 3 minutes from its release, not from when it was booked.
create or replace function public.expire_stale_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from public.orders
    where status = 'placed' and coalesce(released_at, placed_at) < now() - interval '3 minutes'
    order by placed_at
    for update skip locked
  loop
    perform public.apply_order_transition(v_id, 'expired', 'system', null, null, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Hands every scheduled order due by p_at to its shop, with that day's pickup token, or cancels it
-- when the shop is closed. pg_cron runs it every minute. Returns how many orders it released.
create or replace function public.release_scheduled_orders(p_at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_open boolean;
  v_token integer;
  v_count integer := 0;
begin
  for v_order in
    select * from public.orders
    where status = 'scheduled' and release_at <= p_at
    order by release_at
    for update skip locked
  loop
    select is_open into v_open from public.shops where id = v_order.shop_id;
    if v_open then
      insert into public.shop_daily_counters as c (shop_id, day, last_token)
      values (v_order.shop_id, (p_at at time zone 'Asia/Kolkata')::date, 1)
      on conflict (shop_id, day) do update set last_token = c.last_token + 1
      returning c.last_token into v_token;
      update public.orders set token_no = v_token, released_at = p_at where id = v_order.id;
      perform public.apply_order_transition(v_order.id, 'placed', 'system', null, null, null);
      v_count := v_count + 1;
    else
      perform public.apply_order_transition(
        v_order.id, 'cancelled', 'system', null, 'The shop was closed at your scheduled time', null
      );
    end if;
  end loop;
  return v_count;
end;
$$;

-- Pushes: a scheduled order a student cancels never reached the shop, so the shop isn't told.
create or replace function public.queue_order_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  v_shop text;
  v_place text;
  v_items integer;
  v_title text;
  v_body text;
begin
  select * into o from public.orders where id = new.order_id;
  select name into v_shop from public.shops where id = o.shop_id;
  select name into v_place from public.drop_points where id = o.drop_point_id;

  -- Riders.
  if new.to_status = 'accepted' and o.mode = 'delivery' and o.rider_id is null then
    insert into public.push_outbox (user_id, app, title, body, data)
    select r.profile_id, 'consumer', 'New delivery',
      v_shop || ' to ' || v_place || ' · earn ' || public.rupees_text(public.rider_payout_for(o)),
      jsonb_build_object('deliveryId', o.id)
    from public.riders r
    join public.profiles p on p.id = r.profile_id
    where r.status = 'approved' and r.online and not p.blocked and r.profile_id <> o.student_id;
  elsif o.rider_id is not null and new.to_status = 'ready' then
    insert into public.push_outbox (user_id, app, title, body, data)
    values (o.rider_id, 'consumer', 'Ready for pickup', 'Order #' || o.code || ' is ready at ' || v_shop || '.',
            jsonb_build_object('deliveryId', o.id));
  elsif o.rider_id is not null and new.to_status in ('rejected', 'cancelled', 'expired') then
    insert into public.push_outbox (user_id, app, title, body, data)
    values (o.rider_id, 'consumer', 'Delivery called off', 'Order #' || o.code || ' was cancelled. No need to pick it up.',
            jsonb_build_object('deliveryId', o.id));
  end if;

  -- The shop's staff.
  if new.to_status = 'placed' or (new.to_status = 'cancelled' and new.actor = 'student') then
    -- A scheduled order the student called off never reached the shop: nobody to tell.
    if new.to_status = 'cancelled' and new.from_status is distinct from 'placed' then
      return new;
    end if;
    if new.to_status = 'placed' then
      select coalesce(sum(qty), 0)::integer into v_items from public.order_items where order_id = o.id;
      v_title := 'New order #' || o.code;
      v_body := v_items || case when v_items = 1 then ' item' else ' items' end
        || ' · ' || public.rupees_text(o.total_paise)
        || ' · ' || case when o.mode = 'delivery' then 'Deliver to ' || v_place else 'Pickup, token #' || o.token_no end;
    else
      v_title := 'Order #' || o.code || ' was cancelled';
      v_body := 'The student cancelled it before you accepted.';
    end if;
    insert into public.push_outbox (user_id, app, title, body, data)
    select s.profile_id, 'merchant', v_title, v_body, jsonb_build_object('orderId', o.id)
    from public.shop_staff s
    where s.shop_id = o.shop_id;
    return new;
  end if;

  -- The student.
  case new.to_status
    when 'accepted' then
      v_title := v_shop || ' accepted your order';
      v_body := 'Ready in about ' || o.prep_minutes || ' min.';
    when 'ready' then
      if o.mode = 'pickup' then
        v_title := 'Ready for pickup';
        v_body := 'Show token #' || o.token_no || ' at ' || v_shop || '.';
      else
        v_title := 'Your order is packed';
        v_body := v_shop || ' will send it out shortly.';
      end if;
    when 'out_for_delivery' then
      v_title := 'On the way';
      v_body := 'Your order from ' || v_shop || ' is heading to ' || v_place || '. Keep your delivery code ready.';
    when 'rejected' then
      v_title := v_shop || ' could not take your order';
      v_body := coalesce(o.cancel_reason || '. ', '') || 'Nothing to pay.';
    when 'cancelled' then
      v_title := 'Your order was cancelled';
      v_body := coalesce(o.cancel_reason || '. ', '') || 'Nothing to pay.';
    when 'expired' then
      v_title := 'Order not accepted in time';
      v_body := v_shop || ' did not respond, so the order was dropped. Nothing to pay.';
    else
      return new;
  end case;

  insert into public.push_outbox (user_id, app, title, body, data)
  values (o.student_id, 'consumer', v_title, v_body, jsonb_build_object('orderId', o.id));
  return new;
exception when others then
  raise warning 'queue_order_push skipped order %: %', new.order_id, sqlerrm;
  return new;
end;
$$;


revoke all on function public.walk_minutes(uuid, public.order_mode, uuid) from public, anon, authenticated;
revoke all on function public.schedule_problem(uuid, public.order_mode, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.release_scheduled_orders(timestamptz) from public, anon, authenticated;
revoke all on function public.place_order(uuid, public.order_mode, public.pay_method, jsonb, uuid, text, text, timestamptz) from public, anon;
grant execute on function public.place_order(uuid, public.order_mode, public.pay_method, jsonb, uuid, text, text, timestamptz) to authenticated;
