-- Before launch: shops get more time and a nudge, students get a kinder message when a shop misses an
-- order, and shops open by themselves at their opening time as well as closing at their closing time.

-- 1. Seven minutes to accept, with a reminder at two ------------------------------------------------
-- One phone now takes the orders of several outlets, often in a rush. A new order rings at once; if
-- nobody has answered it after 2 minutes, every login at the shop gets a second, loud notification;
-- after 7 minutes it is dropped. packages/core ACCEPT_WINDOW_MS matches.
alter table public.orders add column shop_reminded_at timestamptz;

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
      'Accept or reject it in the next 5 minutes, or it is dropped.', jsonb_build_object('orderId', o.id)
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

-- 2. A kinder note when a shop misses an order ------------------------------------------------------
-- Same as before except the 'expired' wording: it doesn't blame the shop, and says what to do next.
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

-- 3. Shops open at their opening time ---------------------------------------------------------------
-- close_shops_after_hours already closes shops when their hours end. This opens them when the hours
-- start: only at that moment, so a shop closed by hand during the day stays closed until the next
-- opening. Shops without hours (always switched by hand) are left alone. The _platform migration runs
-- it every 5 minutes.
create or replace function public.open_shops_at_opening(p_at timestamptz default now())
returns integer
language sql
security definer
set search_path = ''
as $$
  with opened as (
    update public.shops
    set is_open = true
    where not is_open and hours <> '{}'::jsonb
      and public.within_shop_hours(hours, p_at)
      and not public.within_shop_hours(hours, p_at - interval '5 minutes')
    returning id
  )
  select count(*)::integer from opened;
$$;

revoke all on function public.open_shops_at_opening(timestamptz) from public, anon, authenticated;

