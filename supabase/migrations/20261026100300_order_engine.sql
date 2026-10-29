-- The order engine (build session 1.2).
-- Every order is created by place_order and changed by transition_order. can_transition and
-- calculate_bill mirror packages/core/src/orders.ts and bill.ts; db-tests check that they agree.

-- Same rules as canTransition() in packages/core/src/orders.ts.
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
      (p_from = 'placed' and p_to in ('accepted', 'rejected', 'cancelled', 'expired'))
      or (p_from = 'accepted' and p_to in ('ready', 'cancelled'))
      or (p_from = 'ready' and p_to in ('out_for_delivery', 'collected'))
      or (p_from = 'out_for_delivery' and p_to = 'delivered')
    ) then false
    when p_to = 'out_for_delivery' and p_mode <> 'delivery' then false
    when p_to = 'collected' and p_mode <> 'pickup' then false
    -- Students cancel only before the shop accepts; after that only the shop can.
    when p_to = 'cancelled' then
      case when p_from = 'placed' then p_actor = 'student' else p_actor = 'shop' end
    when p_to in ('accepted', 'rejected', 'ready', 'collected') then p_actor = 'shop'
    when p_to in ('out_for_delivery', 'delivered') then p_actor in ('shop', 'rider')
    when p_to = 'expired' then p_actor = 'system'
    else false
  end;
$$;

-- Same rules as calculateBill() in packages/core/src/bill.ts. Defaults match DEFAULT_FEE_RULES.
create or replace function public.calculate_bill(p_subtotal_paise integer, p_mode public.order_mode)
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
  v_limit integer := coalesce((select f.value_paise from public.fee_rules f where f.key = 'small_cart_limit'), 9900);
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

-- Creates an order for the signed-in student. Prices always come from the database: the app sends
-- only variant ids and quantities, as [{"variant_id": "...", "qty": 2}, ...].
create or replace function public.place_order(
  p_shop_id uuid,
  p_mode public.order_mode,
  p_pay_method public.pay_method,
  p_items jsonb,
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
  v_shop public.shops;
  v_requested integer;
  v_in_shop integer;
  v_available integer;
  v_too_many integer;
  v_subtotal integer;
  v_bill record;
  v_token integer;
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
  if not v_shop.is_open then
    raise exception 'This shop is closed right now' using errcode = 'P0001';
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

  insert into public.shop_daily_counters as c (shop_id, day, last_token)
  values (p_shop_id, (now() at time zone 'Asia/Kolkata')::date, 1)
  on conflict (shop_id, day) do update set last_token = c.last_token + 1
  returning c.last_token into v_token;

  insert into public.orders (
    code, student_id, shop_id, mode, drop_point_id, room_note, pay_method,
    subtotal_paise, delivery_fee_paise, small_cart_fee_paise, platform_fee_paise, total_paise, token_no
  )
  values (
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    v_user, p_shop_id, p_mode, p_drop_point_id,
    case when p_mode = 'delivery' then coalesce(nullif(trim(p_room_note), ''), v_profile.room_note) end,
    p_pay_method,
    v_bill.subtotal_paise, v_bill.delivery_fee_paise, v_bill.small_cart_fee_paise,
    v_bill.platform_fee_paise, v_bill.total_paise, v_token
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

  insert into public.order_secrets (order_id, delivery_otp)
  values (v_order.id, lpad(floor(random() * 10000)::integer::text, 4, '0'));

  insert into public.order_events (order_id, from_status, to_status, actor, actor_id)
  values (v_order.id, null, 'placed', 'student', v_user);

  return v_order;
end;
$$;

-- Applies one status change and records it. Internal: callers must decide the actor first.
create or replace function public.apply_order_transition(
  p_order_id uuid,
  p_to public.order_status,
  p_actor text,
  p_actor_id uuid,
  p_note text,
  p_prep_minutes integer
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_from public.order_status;
  v_note text := nullif(trim(p_note), '');
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  v_from := v_order.status;

  if not public.can_transition(v_from, p_to, v_order.mode, p_actor) then
    raise exception 'This order cannot move from % to %', v_from, p_to using errcode = 'P0001';
  end if;
  if p_prep_minutes is not null and (p_prep_minutes < 1 or p_prep_minutes > 120) then
    raise exception 'Prep time must be between 1 and 120 minutes' using errcode = 'P0001';
  end if;

  update public.orders o set
    status = p_to,
    prep_minutes = case
      when p_to = 'accepted' then coalesce(p_prep_minutes, (select s.prep_minutes from public.shops s where s.id = o.shop_id))
      else o.prep_minutes end,
    accepted_at = case when p_to = 'accepted' then now() else o.accepted_at end,
    ready_at = case when p_to = 'ready' then now() else o.ready_at end,
    out_at = case when p_to = 'out_for_delivery' then now() else o.out_at end,
    completed_at = case when p_to in ('delivered', 'collected') then now() else o.completed_at end,
    cancelled_at = case when p_to in ('rejected', 'cancelled', 'expired') then now() else o.cancelled_at end,
    cancel_reason = case
      when p_to = 'expired' then 'Not accepted in time'
      when p_to in ('rejected', 'cancelled') then v_note
      else o.cancel_reason end
  where o.id = p_order_id
  returning * into v_order;

  insert into public.order_events (order_id, from_status, to_status, actor, actor_id, note)
  values (p_order_id, v_from, p_to, p_actor, p_actor_id, v_note);

  return v_order;
end;
$$;

-- Moves an order on behalf of the signed-in student, shop staff member or admin.
-- p_code is the delivery OTP (to deliver) or the pickup token (to hand over a pickup order).
create or replace function public.transition_order(
  p_order_id uuid,
  p_to public.order_status,
  p_note text default null,
  p_code text default null,
  p_prep_minutes integer default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_order public.orders;
  v_actor text;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if public.is_admin() then
    v_actor := 'admin';
  elsif exists (
    select 1 from public.shop_staff s where s.shop_id = v_order.shop_id and s.profile_id = v_user
  ) then
    v_actor := 'shop';
  elsif v_order.student_id = v_user then
    v_actor := 'student';
  else
    -- Same message as a missing order, so nobody can probe other people's orders.
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if not public.can_transition(v_order.status, p_to, v_order.mode, v_actor) then
    raise exception 'This order cannot move from % to %', v_order.status, p_to using errcode = 'P0001';
  end if;

  if p_to = 'delivered'
     and p_code is distinct from (select s.delivery_otp from public.order_secrets s where s.order_id = v_order.id) then
    raise exception 'Wrong delivery code' using errcode = 'P0001';
  end if;
  if p_to = 'collected' and p_code is distinct from v_order.token_no::text then
    raise exception 'Wrong pickup token' using errcode = 'P0001';
  end if;
  if p_to in ('rejected', 'cancelled') and v_actor in ('shop', 'admin') and nullif(trim(p_note), '') is null then
    raise exception 'Give a reason' using errcode = 'P0001';
  end if;

  return public.apply_order_transition(v_order.id, p_to, v_actor, v_user, p_note, p_prep_minutes);
end;
$$;

-- Expires orders no shop accepted within 3 minutes (ACCEPT_WINDOW_MS in packages/core).
-- Scheduled every minute by pg_cron in the platform migration.
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
    where status = 'placed' and placed_at < now() - interval '3 minutes'
    order by placed_at
    for update skip locked
  loop
    perform public.apply_order_transition(v_id, 'expired', 'system', null, null, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.can_transition(public.order_status, public.order_status, public.order_mode, text) from public, anon;
revoke all on function public.calculate_bill(integer, public.order_mode) from public, anon;
revoke all on function public.place_order(uuid, public.order_mode, public.pay_method, jsonb, uuid, text) from public, anon;
revoke all on function public.transition_order(uuid, public.order_status, text, text, integer) from public, anon;
revoke all on function public.apply_order_transition(uuid, public.order_status, text, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.expire_stale_orders() from public, anon, authenticated;

grant execute on function public.can_transition(public.order_status, public.order_status, public.order_mode, text) to authenticated;
grant execute on function public.calculate_bill(integer, public.order_mode) to authenticated;
grant execute on function public.place_order(uuid, public.order_mode, public.pay_method, jsonb, uuid, text) to authenticated;
grant execute on function public.transition_order(uuid, public.order_status, text, text, integer) to authenticated;
