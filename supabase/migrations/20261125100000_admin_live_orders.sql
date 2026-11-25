-- Admin → Live orders: every open order in every shop, with the student's delivery code and pickup
-- token, a way to finish an order a shop forgot to mark (no code needed), and a push to admins for
-- every new order. Asked for on 25 Nov 2026, after a delivered order stayed "out for delivery".

-- 1. The state machine: admins may finish an open order.
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
    -- Admins may finish any open order a shop forgot to finish (admin_complete_order): a delivery
    -- becomes delivered, a pickup collected. No code is asked for on that path.
    when p_actor = 'admin' and p_to in ('delivered', 'collected') and p_from in ('accepted', 'ready', 'out_for_delivery') then
      (p_to = 'delivered') = (p_mode = 'delivery')
    -- Admins may cancel any open order.
    when p_to = 'cancelled' and p_actor = 'admin' then true
    when not (
      (p_from = 'scheduled' and p_to in ('placed', 'cancelled'))
      or (p_from = 'placed' and p_to in ('accepted', 'rejected', 'cancelled', 'expired'))
      or (p_from = 'accepted' and p_to in ('ready', 'cancelled'))
      or (p_from = 'ready' and p_to in ('out_for_delivery', 'collected', 'cancelled'))
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

-- 2. Every open order, oldest first, with what an admin needs to help: who, where, the code and token.
-- Admins only (the function refuses anyone else), so the codes never reach shops or students.
create or replace function public.admin_live_orders()
returns table (
  id uuid,
  code text,
  status public.order_status,
  mode public.order_mode,
  shop_id uuid,
  shop_name text,
  shop_phone text,
  student_name text,
  student_phone text,
  drop_point text,
  room_note text,
  token_no integer,
  delivery_otp text,
  rider_name text,
  total_paise integer,
  items text,
  placed_at timestamptz,
  accepted_at timestamptz,
  ready_at timestamptz,
  out_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see live orders' using errcode = '42501';
  end if;
  return query
    select o.id, o.code, o.status, o.mode, o.shop_id, s.name, s.phone, st.name, st.phone, d.name, o.room_note,
           o.token_no, sec.delivery_otp, r.name, o.total_paise,
           (select string_agg(i.qty || '× ' || i.name_snapshot, ', ' order by i.name_snapshot)
              from public.order_items i where i.order_id = o.id),
           o.placed_at, o.accepted_at, o.ready_at, o.out_at
    from public.orders o
    join public.shops s on s.id = o.shop_id
    join public.profiles st on st.id = o.student_id
    left join public.drop_points d on d.id = o.drop_point_id
    left join public.order_secrets sec on sec.order_id = o.id
    left join public.profiles r on r.id = o.rider_id
    where o.status in ('scheduled', 'placed', 'accepted', 'ready', 'out_for_delivery')
    order by o.placed_at;
end;
$$;

-- 3. Finish an order without the student's code: a delivery becomes delivered, a pickup collected.
-- Admins only, with a reason that is kept on the order's history.
create or replace function public.admin_complete_order(p_order_id uuid, p_note text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception 'Only admins can finish an order this way' using errcode = '42501';
  end if;
  if nullif(trim(p_note), '') is null then
    raise exception 'Give a reason' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  return public.apply_order_transition(
    v_order.id,
    case when v_order.mode = 'delivery' then 'delivered'::public.order_status else 'collected'::public.order_status end,
    'admin',
    (select auth.uid()),
    p_note,
    null
  );
end;
$$;

-- 4. Order pushes: as before, plus one to every admin for each new order.
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
    -- Admins hear about every new order in every shop, to step in if a shop is slow or unsure.
    if new.to_status = 'placed' then
      insert into public.push_outbox (user_id, app, title, body, data)
      select p.id, 'consumer', 'New order at ' || v_shop, v_body, jsonb_build_object('adminOrderId', o.id)
      from public.profiles p
      where p.role = 'admin' and not p.blocked;
    end if;
    insert into public.push_outbox (user_id, app, title, body, data)
    select s.profile_id, 'merchant', v_title, v_body,
      case when new.to_status = 'placed' then public.order_ring_data(o) else jsonb_build_object('orderId', o.id) end
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
      if new.actor = 'shop' then
        v_title := v_shop || ' had to cancel your order';
        v_body := coalesce(o.cancel_reason || '. ', '') || 'Nothing to pay. Sorry about that.';
      else
        v_title := 'Your order was cancelled';
        v_body := coalesce(o.cancel_reason || '. ', '') || 'Nothing to pay.';
      end if;
    when 'expired' then
      v_title := v_shop || ' was too busy';
      v_body := 'They couldn''t take your order in time. Nothing to pay. Try again in a bit, or order from another shop.';
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

revoke all on function public.admin_live_orders() from public, anon;
revoke all on function public.admin_complete_order(uuid, text) from public, anon;
grant execute on function public.admin_live_orders() to authenticated;
grant execute on function public.admin_complete_order(uuid, text) to authenticated;
