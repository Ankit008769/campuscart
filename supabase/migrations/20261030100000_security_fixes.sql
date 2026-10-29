-- Security fixes from the October 2026 review. Each one closes an attack that db-tests/security-fixes.test.ts
-- reproduces.
--
-- 1. Group orders: members saw each other's whole profile (phone, email, room) through a profiles policy,
--    and the join code is shared in WhatsApp groups. Members now get a display name stored on their
--    membership row, and the profiles policy goes.
-- 2. invite_shop_staff overwrote any allowed_logins row for the email (on conflict do update), so a shop
--    owner could turn an approved, not yet signed-in admin or another shop's owner into their own counter
--    staff. It now refuses emails approved for anything else.
-- 3. invite_shop_staff also added people who already work at another shop. Refused now.
-- 4. An approved rider could change their payout UPI ID and stay approved, so whoever got onto a rider's
--    account could redirect the week's payout. A new UPI ID on an approved rider goes back to admins.
-- 5. No limit on open pay-on-handover orders: one account could fill every kitchen with orders nobody
--    collects. At most 3 open checkouts per student (a multi-shop cart counts once).
-- 6. Shops kept reading a customer's phone and room forever, and riders the students they once delivered
--    to. Shops now see a customer while an order is open and for 7 days after it ends; riders only while
--    the delivery is open.

-- 1. Group order names ---------------------------------------------------------------------------------

alter table public.group_members add column display_name text;

-- Fills the name from the member's profile. Group rows are only written inside the group functions,
-- which run as the owner, so the profile is readable here.
create or replace function public.set_group_member_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.display_name := (select p.name from public.profiles p where p.id = new.student_id);
  return new;
end;
$$;

create trigger group_member_name
  before insert on public.group_members
  for each row execute function public.set_group_member_name();

update public.group_members m set display_name = p.name from public.profiles p where p.id = m.student_id;

drop policy "group members see each other's names" on public.profiles;

-- 2 and 3. Shop owners add only fresh counter staff ------------------------------------------------------

create or replace function public.invite_shop_staff(p_shop_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_profile public.profiles;
  v_approved public.allowed_logins;
begin
  if not public.is_shop_owner(p_shop_id) then
    raise exception 'Only the shop owner can add staff' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter an email address' using errcode = '22023';
  end if;
  if v_email like '%@nith.ac.in' then
    raise exception 'Use a personal Gmail, not a student account' using errcode = 'P0001';
  end if;

  -- An approval only admins may change: another role, or staff of another shop.
  select * into v_approved from public.allowed_logins where email = v_email;
  if found and (v_approved.role <> 'merchant_staff' or v_approved.shop_id is distinct from p_shop_id) then
    raise exception 'That email is already set up for something else. Ask the CampusCart team.' using errcode = 'P0001';
  end if;

  select * into v_profile from public.profiles where email = v_email;
  if found then
    if v_profile.role <> 'student' and v_profile.role <> 'merchant_staff' then
      raise exception 'That account already has another role' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.shop_staff s where s.profile_id = v_profile.id and s.shop_id <> p_shop_id) then
      raise exception 'That person already works at another shop' using errcode = 'P0001';
    end if;
    update public.profiles set role = 'merchant_staff' where id = v_profile.id;
    insert into public.shop_staff (shop_id, profile_id, role) values (p_shop_id, v_profile.id, 'counter')
    on conflict do nothing;
    return 'added';
  end if;

  insert into public.allowed_logins (email, role, shop_id, note)
  values (v_email, 'merchant_staff', p_shop_id, 'Added by the shop owner')
  on conflict (email) do nothing;
  return 'invited';
end;
$$;

-- 4. A new payout UPI ID needs an admin again ------------------------------------------------------------

create or replace function public.apply_as_rider(p_upi_vpa text)
returns public.riders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_upi text := trim(coalesce(p_upi_vpa, ''));
  v_profile public.profiles;
  v_rider public.riders;
  v_changed boolean;
begin
  select * into v_profile from public.profiles where id = v_user;
  if not found or v_profile.blocked or v_profile.role <> 'student' then
    raise exception 'Only students can deliver for CampusCart' using errcode = '42501';
  end if;
  if v_profile.phone is null then
    raise exception 'Add your mobile number to your profile first' using errcode = 'P0001';
  end if;
  if v_upi !~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,63}$' then
    raise exception 'Enter a UPI ID like name@okaxis' using errcode = '22023';
  end if;

  select * into v_rider from public.riders where profile_id = v_user for update;
  v_changed := found and v_rider.status = 'approved' and v_rider.upi_vpa is distinct from v_upi;
  -- Going back to admins mid-delivery would strand the orders in hand.
  if v_changed and exists (
    select 1 from public.orders o
    where o.rider_id = v_user and o.status not in ('delivered', 'collected', 'rejected', 'cancelled', 'expired')
  ) then
    raise exception 'Finish your deliveries before changing your UPI ID' using errcode = 'P0001';
  end if;

  insert into public.riders (profile_id, upi_vpa)
  values (v_user, v_upi)
  on conflict (profile_id) do update set
    upi_vpa = excluded.upi_vpa,
    status = case
      when public.riders.status = 'rejected' or v_changed then 'applied'::public.rider_status
      else public.riders.status
    end,
    online = case when v_changed then false else public.riders.online end,
    applied_at = case when public.riders.status = 'rejected' or v_changed then now() else public.riders.applied_at end,
    admin_note = case
      when v_changed then 'Changed their payout UPI ID. Check it before approving again.'
      else public.riders.admin_note
    end
  returning * into v_rider;
  return v_rider;
end;
$$;

-- 5. At most 3 open pay-on-handover checkouts per student ----------------------------------------------

-- Internal: place_order and place_cart call it; group orders, which the host already committed to when
-- opening the group, do not.
create or replace function public.check_open_checkout_limit(p_student uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (
    select count(distinct coalesce(o.cart_id, o.id))
    from public.orders o
    where o.student_id = p_student
      and o.pay_method in ('cash', 'upi_at_handover')
      and o.status not in ('delivered', 'collected', 'rejected', 'cancelled', 'expired')
  ) >= 3 then
    raise exception 'You already have 3 orders on the way. Collect or cancel one before ordering again.'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.check_open_checkout_limit(uuid) from public, anon, authenticated;
revoke all on function public.set_group_member_name() from public, anon, authenticated;

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
begin
  perform public.check_open_checkout_limit((select auth.uid()));
  return public.place_shop_order(
    (select auth.uid()), p_shop_id, p_mode, p_pay_method, p_items, p_drop_point_id, p_room_note,
    p_coupon_code, p_scheduled_for, null, true, null
  );
end;
$$;

-- 6. Customer details only while they are needed --------------------------------------------------------

drop policy "shops read their customers" on public.profiles;
create policy "shops read their customers" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.orders o
      where o.student_id = profiles.id
        and o.shop_id in (select public.my_shop_ids())
        and (
          o.status not in ('delivered', 'collected', 'rejected', 'cancelled', 'expired')
          or coalesce(o.completed_at, o.cancelled_at, o.placed_at) > now() - interval '7 days'
        )
    )
  );

drop policy "riders read the students they deliver to" on public.profiles;
create policy "riders read the students they deliver to" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.orders o
      where o.student_id = profiles.id
        and o.rider_id = (select auth.uid())
        and o.status not in ('delivered', 'collected', 'rejected', 'cancelled', 'expired')
    )
  );

-- place_cart, unchanged except that it now checks the open-checkout limit first.
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
  perform public.check_open_checkout_limit(v_user);
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

