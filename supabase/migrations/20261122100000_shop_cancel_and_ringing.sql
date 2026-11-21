-- Shops can call off an order they already took, and shop phones ring like an incoming call.
--
-- 1. Cancelling after accepting. A shop that accepted by mistake, or finds out while cooking that
-- something has run out, could only mark the order packed. Shops could already cancel an accepted
-- order (with a reason); they can now also cancel one that is packed but hasn't left the shop. The
-- student is told which shop cancelled and why. canTransition in packages/core/src/orders.ts matches.
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

-- 2. Ringing. A new order, and the 2-minute reminder, carry ring = true and the moment the order
-- would be dropped. The shop app (1.0.5 on) then rings on a loop, like an incoming call, until
-- someone taps the notification or opens the app, even when the app was swiped away; it stops by
-- itself at ringUntil. Older builds ignore both fields. send-push passes them on to Firebase.
create or replace function public.order_ring_data(o public.orders)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'orderId', o.id,
    'ring', true,
    'ringUntil', (extract(epoch from coalesce(o.released_at, o.placed_at) + interval '7 minutes') * 1000)::bigint
  );
$$;

revoke all on function public.order_ring_data(public.orders) from public, anon, authenticated;

create or replace function public.expire_stale_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
  o public.orders;
begin
  for o in
    select * from public.orders
    where status = 'placed' and shop_reminded_at is null
      and coalesce(released_at, placed_at) < now() - interval '2 minutes'
      and coalesce(released_at, placed_at) >= now() - interval '7 minutes'
    order by placed_at
    for update skip locked
  loop
    update public.orders set shop_reminded_at = now() where id = o.id;
    insert into public.push_outbox (user_id, app, title, body, data)
    select s.profile_id, 'merchant', 'Order #' || o.code || ' is still waiting',
      'Accept or reject it in the next 5 minutes, or it is dropped.', public.order_ring_data(o)
    from public.shop_staff s
    where s.shop_id = o.shop_id;
  end loop;

  for v_id in
    select id from public.orders
    where status = 'placed' and coalesce(released_at, placed_at) < now() - interval '7 minutes'
    order by placed_at
    for update skip locked
  loop
    perform public.apply_order_transition(v_id, 'expired', 'system', null, null, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.expire_stale_orders() from public, anon, authenticated;

-- Same as before except: new orders ring (order_ring_data), and a shop cancelling says who and why.
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
