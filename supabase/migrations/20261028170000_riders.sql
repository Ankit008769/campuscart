-- Student riders (build session 2.6).
--
-- A student applies with a UPI ID for payouts, an admin approves them, and an approved rider who
-- switches online sees delivery offers. The first rider to claim an offer gets it: claiming is a
-- single conditional update, so two riders can never hold the same order. The rider picks the
-- order up at the shop (out_for_delivery) and delivers it with the student's code, like a shop.
-- Riders stay students: profiles.role doesn't change and they can still order.

create type public.rider_status as enum ('applied', 'approved', 'rejected', 'suspended');

create table public.riders (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  status public.rider_status not null default 'applied',
  upi_vpa text not null check (upi_vpa ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,63}$'),
  online boolean not null default false,
  applied_at timestamptz not null default now(),
  decided_at timestamptz,
  admin_note text,
  check (not online or status = 'approved')
);

-- One row per rider per week (Monday to Sunday, Indian time), made when admins prepare payouts.
create table public.rider_payouts (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.profiles (id),
  week_start date not null check (extract(isodow from week_start) = 1),
  deliveries integer not null check (deliveries > 0),
  amount_paise integer not null check (amount_paise >= 0),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  reference text,
  unique (rider_id, week_start)
);

alter table public.orders
  add column rider_id uuid references public.profiles (id),
  add column rider_assigned_at timestamptz,
  add column rider_payout_paise integer not null default 0 check (rider_payout_paise >= 0),
  add column rider_payout_id uuid references public.rider_payouts (id);
create index orders_rider_id_idx on public.orders (rider_id) where rider_id is not null;
create index orders_open_offers_idx on public.orders (status) where mode = 'delivery' and rider_id is null;

alter table public.riders enable row level security;
alter table public.rider_payouts enable row level security;

create policy "riders read their own record" on public.riders
  for select to authenticated using (profile_id = (select auth.uid()) or public.is_admin());
create policy "riders read their own payouts" on public.rider_payouts
  for select to authenticated using (rider_id = (select auth.uid()) or public.is_admin());
create policy "riders read their deliveries" on public.orders
  for select to authenticated using (rider_id = (select auth.uid()));
-- A rider sees the student they deliver to; the student and the shop see the rider.
create policy "riders read the students they deliver to" on public.profiles
  for select to authenticated using (
    exists (select 1 from public.orders o where o.student_id = profiles.id and o.rider_id = (select auth.uid()))
  );
create policy "students and shops read their order's rider" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.orders o
      where o.rider_id = profiles.id
        and (o.student_id = (select auth.uid()) or o.shop_id in (select public.my_shop_ids()))
    )
  );
grant select on public.riders, public.rider_payouts to authenticated;

-- What a rider earns per delivery: the rider_payout fee rule, or the order's delivery fee.
create or replace function public.rider_payout_for(p_order public.orders)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce((select f.value_paise from public.fee_rules f where f.key = 'rider_payout'), p_order.delivery_fee_paise);
$$;

create or replace function public.is_online_rider()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.riders r
    join public.profiles p on p.id = r.profile_id
    where r.profile_id = (select auth.uid()) and r.status = 'approved' and r.online and not p.blocked
  );
$$;

-- Apply, or update the UPI ID. A rejected student may apply again; a suspended one stays suspended.
create or replace function public.apply_as_rider(p_upi_vpa text)
returns public.riders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_profile public.profiles;
  v_rider public.riders;
begin
  select * into v_profile from public.profiles where id = v_user;
  if not found or v_profile.blocked or v_profile.role <> 'student' then
    raise exception 'Only students can deliver for CampusCart' using errcode = '42501';
  end if;
  if v_profile.phone is null then
    raise exception 'Add your mobile number to your profile first' using errcode = 'P0001';
  end if;
  if trim(coalesce(p_upi_vpa, '')) !~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,63}$' then
    raise exception 'Enter a UPI ID like name@okaxis' using errcode = '22023';
  end if;
  insert into public.riders (profile_id, upi_vpa)
  values (v_user, trim(p_upi_vpa))
  on conflict (profile_id) do update set
    upi_vpa = excluded.upi_vpa,
    status = case when public.riders.status = 'rejected' then 'applied'::public.rider_status else public.riders.status end,
    applied_at = case when public.riders.status = 'rejected' then now() else public.riders.applied_at end
  returning * into v_rider;
  return v_rider;
end;
$$;

create or replace function public.set_rider_online(p_online boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.riders set online = p_online
  where profile_id = (select auth.uid()) and status = 'approved';
  if not found then
    raise exception 'Only approved riders can go online' using errcode = '42501';
  end if;
end;
$$;

-- Admins approve, reject or suspend. Anything but approval also takes the rider offline.
create or replace function public.decide_rider(p_profile_id uuid, p_status public.rider_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve riders' using errcode = '42501';
  end if;
  update public.riders set
    status = p_status,
    decided_at = now(),
    admin_note = nullif(trim(p_note), ''),
    online = online and p_status = 'approved'
  where profile_id = p_profile_id;
  if not found then
    raise exception 'No rider application for that student' using errcode = 'P0002';
  end if;
end;
$$;

-- Open delivery offers for an online rider: accepted or ready delivery orders with no rider yet,
-- from the last two hours, except the rider's own orders. Only what a rider needs to decide.
create or replace function public.list_delivery_offers()
returns table (
  id uuid,
  code text,
  status public.order_status,
  shop_name text,
  drop_point_name text,
  gate_only boolean,
  items integer,
  payout_paise integer,
  ready_at timestamptz,
  accepted_at timestamptz,
  prep_minutes integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.code, o.status, s.name, d.name, d.gate_only,
    (select coalesce(sum(i.qty), 0)::integer from public.order_items i where i.order_id = o.id),
    public.rider_payout_for(o),
    o.ready_at, o.accepted_at, o.prep_minutes
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.drop_points d on d.id = o.drop_point_id
  where public.is_online_rider()
    and o.mode = 'delivery'
    and o.rider_id is null
    and o.status in ('accepted', 'ready')
    and o.student_id <> (select auth.uid())
    and o.placed_at > now() - interval '2 hours'
  order by o.status = 'ready' desc, o.accepted_at;
$$;

-- Claims an offer. The where clause re-checks rider_id is null on the row as it stands when the
-- update runs, so if two riders tap at once Postgres lets one through and the other finds it taken.
create or replace function public.claim_delivery(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_order public.orders;
  v_rider_name text;
begin
  if not public.is_online_rider() then
    raise exception 'Go online to take deliveries' using errcode = '42501';
  end if;
  if (select count(*) from public.orders
      where rider_id = v_user and status in ('accepted', 'ready', 'out_for_delivery')) >= 2 then
    raise exception 'Finish your current deliveries first (two at a time)' using errcode = 'P0001';
  end if;

  update public.orders o set
    rider_id = v_user,
    rider_assigned_at = now(),
    rider_payout_paise = public.rider_payout_for(o)
  where o.id = p_order_id
    and o.rider_id is null
    and o.mode = 'delivery'
    and o.status in ('accepted', 'ready')
    and o.student_id <> v_user
  returning * into v_order;
  if not found then
    raise exception 'Another rider took this delivery, or it is no longer open' using errcode = 'P0001';
  end if;

  select name into v_rider_name from public.profiles where id = v_user;
  insert into public.push_outbox (user_id, app, title, body, data)
  values (v_order.student_id, 'consumer', 'A rider is on it',
          coalesce(nullif(v_rider_name, ''), 'A CampusCart rider') || ' will bring your order.',
          jsonb_build_object('orderId', v_order.id));
  return v_order;
end;
$$;

-- Gives a delivery back before pickup, so another rider can take it. Admins can do it for anyone.
create or replace function public.release_delivery(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders set rider_id = null, rider_assigned_at = null, rider_payout_paise = 0
  where id = p_order_id
    and status in ('accepted', 'ready')
    and (rider_id = (select auth.uid()) or (rider_id is not null and public.is_admin()));
  if not found then
    raise exception 'Only a delivery not yet picked up can be given back' using errcode = 'P0001';
  end if;
end;
$$;

-- Status changes now also accept the order's rider (pickup and delivery, never cancelling).
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
  elsif v_order.rider_id = v_user then
    v_actor := 'rider';
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

-- Weekly payouts: one row per rider for every delivery completed that week (Indian time) and not
-- yet in a payout. Running it twice adds nothing twice. Returns how many payouts it made.
create or replace function public.prepare_rider_payouts(p_week_start date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := p_week_start::timestamp at time zone 'Asia/Kolkata';
  v_to timestamptz := (p_week_start + 7)::timestamp at time zone 'Asia/Kolkata';
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins can prepare payouts' using errcode = '42501';
  end if;
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'Payout weeks start on a Monday' using errcode = '22023';
  end if;
  if v_to > now() then
    raise exception 'That week is not over yet' using errcode = 'P0001';
  end if;

  with week as (
    select o.rider_id, count(*)::integer as deliveries, sum(o.rider_payout_paise)::integer as amount
    from public.orders o
    where o.status = 'delivered' and o.rider_id is not null and o.rider_payout_id is null
      and o.completed_at >= v_from and o.completed_at < v_to
    group by o.rider_id
  ), made as (
    insert into public.rider_payouts (rider_id, week_start, deliveries, amount_paise)
    select rider_id, p_week_start, deliveries, amount from week
    on conflict (rider_id, week_start) do nothing
    returning id, rider_id
  ), linked as (
    update public.orders o set rider_payout_id = made.id
    from made
    where o.rider_id = made.rider_id and o.status = 'delivered' and o.rider_payout_id is null
      and o.completed_at >= v_from and o.completed_at < v_to
    returning o.id
  )
  select count(*)::integer into v_count from made;
  return v_count;
end;
$$;

create or replace function public.mark_payout_paid(p_payout_id uuid, p_reference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can record payouts' using errcode = '42501';
  end if;
  if nullif(trim(p_reference), '') is null then
    raise exception 'Enter the UPI reference of the payment' using errcode = '22023';
  end if;
  update public.rider_payouts set paid_at = now(), reference = trim(p_reference)
  where id = p_payout_id and paid_at is null;
  if not found then
    raise exception 'Payout not found or already paid' using errcode = 'P0002';
  end if;
end;
$$;

-- Pushes for order events, now also for riders: online riders hear about new delivery orders,
-- the assigned rider hears when it's ready or called off.
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

revoke all on function public.rider_payout_for(public.orders) from public, anon, authenticated;
revoke all on function public.is_online_rider() from public, anon;
revoke all on function public.apply_as_rider(text) from public, anon;
revoke all on function public.set_rider_online(boolean) from public, anon;
revoke all on function public.decide_rider(uuid, public.rider_status, text) from public, anon;
revoke all on function public.list_delivery_offers() from public, anon;
revoke all on function public.claim_delivery(uuid) from public, anon;
revoke all on function public.release_delivery(uuid) from public, anon;
revoke all on function public.prepare_rider_payouts(date) from public, anon;
revoke all on function public.mark_payout_paid(uuid, text) from public, anon;
grant execute on function public.is_online_rider() to authenticated;
grant execute on function public.apply_as_rider(text) to authenticated;
grant execute on function public.set_rider_online(boolean) to authenticated;
grant execute on function public.decide_rider(uuid, public.rider_status, text) to authenticated;
grant execute on function public.list_delivery_offers() to authenticated;
grant execute on function public.claim_delivery(uuid) to authenticated;
grant execute on function public.release_delivery(uuid) to authenticated;
grant execute on function public.prepare_rider_payouts(date) to authenticated;
grant execute on function public.mark_payout_paid(uuid, text) to authenticated;
