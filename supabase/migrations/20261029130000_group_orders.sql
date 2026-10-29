-- Group orders for a hostel wing (build session 3.5).
--
-- A host opens a group order for one shop and their drop point with a closing time, and shares its
-- code. Members join and pick their own items. At closing (the host's tap, or pg_cron at
-- closes_at) all items go to the shop as one order with one delivery. Each member's share is their
-- items plus an equal part of the fees; the host collects the shares (pay at handover for now) and
-- ticks off who has paid. Paying separately online waits for the payment gateway.

create table public.group_orders (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id),
  shop_id uuid not null references public.shops (id),
  drop_point_id uuid not null references public.drop_points (id),
  room_note text,
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'placed', 'cancelled')),
  order_id uuid references public.orders (id),
  problem text,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_order_id uuid not null references public.group_orders (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  share_paise integer,
  paid boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (group_order_id, student_id)
);

alter table public.group_orders enable row level security;
alter table public.group_members enable row level security;

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.group_members where group_order_id = p_group_id and student_id = (select auth.uid()));
$$;

create policy "members read their group orders" on public.group_orders
  for select to authenticated using (public.is_group_member(id) or public.is_admin());
create policy "members read who else is in" on public.group_members
  for select to authenticated using (public.is_group_member(group_order_id) or public.is_admin());
create policy "group members see each other's names" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.group_members g
      where g.student_id = profiles.id and public.is_group_member(g.group_order_id)
    )
  );
grant select on public.group_orders, public.group_members to authenticated;

create or replace function public.open_group_order(
  p_shop_id uuid,
  p_drop_point_id uuid,
  p_closes_in_minutes integer,
  p_room_note text default null
)
returns public.group_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_group public.group_orders;
begin
  if v_user is null or exists (select 1 from public.profiles where id = v_user and blocked) then
    raise exception 'This account cannot place orders' using errcode = '42501';
  end if;
  if p_closes_in_minutes is null or p_closes_in_minutes not between 5 and 120 then
    raise exception 'A group order stays open 5 to 120 minutes' using errcode = '22023';
  end if;
  if not exists (select 1 from public.shops where id = p_shop_id and does_delivery) then
    raise exception 'This shop does not deliver' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.drop_points where id = p_drop_point_id and active) then
    raise exception 'Choose where to deliver' using errcode = 'P0001';
  end if;
  insert into public.group_orders (host_id, shop_id, drop_point_id, room_note, closes_at)
  values (v_user, p_shop_id, p_drop_point_id, nullif(trim(p_room_note), ''), now() + make_interval(mins => p_closes_in_minutes))
  returning * into v_group;
  insert into public.group_members (group_order_id, student_id) values (v_group.id, v_user);
  return v_group;
end;
$$;

-- Joins by the shared code. Returns the group's id.
create or replace function public.join_group_order(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.group_orders;
begin
  select * into v_group from public.group_orders where code = upper(trim(p_code));
  if not found then
    raise exception 'No group order with that code' using errcode = 'P0002';
  end if;
  if v_group.status <> 'open' or v_group.closes_at <= now() then
    raise exception 'This group order has closed' using errcode = 'P0001';
  end if;
  if (select count(*) from public.group_members where group_order_id = v_group.id) >= 20 then
    raise exception 'This group order is full' using errcode = 'P0001';
  end if;
  insert into public.group_members (group_order_id, student_id) values (v_group.id, (select auth.uid()))
  on conflict do nothing;
  return v_group.id;
end;
$$;

-- A member's own items, [{"variant_id", "qty"}], while the group is open. Only this shop's sizes.
create or replace function public.set_group_items(p_group_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.group_orders;
begin
  select * into v_group from public.group_orders where id = p_group_id;
  if not found or not public.is_group_member(p_group_id) then
    raise exception 'Group order not found' using errcode = 'P0002';
  end if;
  if v_group.status <> 'open' or v_group.closes_at <= now() then
    raise exception 'This group order has closed' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_items) <> 'array' or exists (
    select 1 from jsonb_to_recordset(p_items) as i(variant_id uuid, qty integer)
    left join public.variants v on v.id = i.variant_id
    left join public.products p on p.id = v.product_id
    where i.qty is null or i.qty not between 1 and 50 or p.shop_id is distinct from v_group.shop_id
  ) then
    raise exception 'Pick items from this shop, 1 to 50 of each' using errcode = '22023';
  end if;
  update public.group_members set items = p_items
  where group_order_id = p_group_id and student_id = (select auth.uid());
end;
$$;

-- Places the group's order and works out each member's share. Internal: place_group_order (the
-- host, early) and place_due_group_orders (pg_cron, at closes_at, p_system) call it. A group with
-- no items is cancelled instead.
create or replace function public.complete_group_order(p_group_id uuid, p_system boolean)
returns public.group_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.group_orders;
  v_items jsonb;
  v_order public.orders;
  v_fees integer;
  v_members integer;
  v_each integer;
begin
  select * into v_group from public.group_orders where id = p_group_id for update;
  if not found then
    raise exception 'Group order not found' using errcode = 'P0002';
  end if;
  if not p_system and v_group.host_id is distinct from (select auth.uid()) then
    raise exception 'Only the host places the group order' using errcode = '42501';
  end if;
  if v_group.status <> 'open' then
    raise exception 'This group order has already closed' using errcode = 'P0001';
  end if;

  select jsonb_agg(i) into v_items
  from public.group_members m, jsonb_array_elements(m.items) i
  where m.group_order_id = p_group_id;
  if v_items is null then
    update public.group_orders set status = 'cancelled', problem = 'Nobody added any items'
    where id = p_group_id returning * into v_group;
    return v_group;
  end if;

  v_order := public.place_shop_order(
    v_group.host_id, v_group.shop_id, 'delivery', 'upi_at_handover', v_items, v_group.drop_point_id,
    v_group.room_note, null, null, null, true, null
  );

  -- Shares: each member's items at the prices just charged, plus an equal part of the fees; the
  -- host takes the odd paise so the shares add up to the order total exactly.
  v_fees := v_order.delivery_fee_paise + v_order.small_cart_fee_paise + v_order.platform_fee_paise + v_order.surcharge_paise;
  select count(*) into v_members from public.group_members where group_order_id = p_group_id and items <> '[]'::jsonb;
  v_each := v_fees / v_members;
  update public.group_members m set share_paise = (
    select coalesce(sum(v.price_paise * (i ->> 'qty')::integer), 0)
    from jsonb_array_elements(m.items) i join public.variants v on v.id = (i ->> 'variant_id')::uuid
  ) + case when m.items <> '[]'::jsonb then v_each else 0 end
    + case when m.student_id = v_group.host_id then v_fees - v_each * v_members else 0 end,
    paid = m.student_id = v_group.host_id
  where m.group_order_id = p_group_id;

  update public.group_orders set status = 'placed', order_id = v_order.id where id = p_group_id returning * into v_group;

  insert into public.push_outbox (user_id, app, title, body, data)
  select m.student_id, 'consumer', 'Group order placed',
    'Your share is ' || public.rupees_text(m.share_paise) || '. Pay the host when it arrives.',
    jsonb_build_object('orderId', v_order.id)
  from public.group_members m
  where m.group_order_id = p_group_id and m.student_id <> v_group.host_id and m.items <> '[]'::jsonb;
  return v_group;
exception when others then
  -- The shop closed, an item ran out: when pg_cron closes it, record why instead of failing.
  if p_system then
    update public.group_orders set status = 'cancelled', problem = sqlerrm where id = p_group_id returning * into v_group;
    return v_group;
  end if;
  raise;
end;
$$;

create or replace function public.place_due_group_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in select id from public.group_orders where status = 'open' and closes_at <= now() loop
    perform public.complete_group_order(v_id, true);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- The host places the group order before its closing time.
create or replace function public.place_group_order(p_group_id uuid)
returns public.group_orders
language sql
security definer
set search_path = ''
as $$
  select * from public.complete_group_order(p_group_id, false);
$$;

-- The host ticks off who has paid them their share.
create or replace function public.set_group_paid(p_group_id uuid, p_student_id uuid, p_paid boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.group_members m set paid = p_paid
  from public.group_orders g
  where g.id = m.group_order_id and m.group_order_id = p_group_id and m.student_id = p_student_id
    and g.host_id = (select auth.uid()) and g.status = 'placed';
  if not found then
    raise exception 'Only the host of a placed group order can do that' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.leave_group_order(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.group_members m
  using public.group_orders g
  where g.id = m.group_order_id and m.group_order_id = p_group_id and m.student_id = (select auth.uid())
    and g.status = 'open' and g.host_id <> m.student_id;
  if not found then
    raise exception 'You can leave an open group order you did not start' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.cancel_group_order(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.group_orders set status = 'cancelled', problem = 'The host cancelled it'
  where id = p_group_id and host_id = (select auth.uid()) and status = 'open';
  if not found then
    raise exception 'Only the host can cancel an open group order' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.is_group_member(uuid) from public, anon;
revoke all on function public.open_group_order(uuid, uuid, integer, text) from public, anon;
revoke all on function public.join_group_order(text) from public, anon;
revoke all on function public.set_group_items(uuid, jsonb) from public, anon;
revoke all on function public.complete_group_order(uuid, boolean) from public, anon, authenticated;
revoke all on function public.place_group_order(uuid) from public, anon;
revoke all on function public.place_due_group_orders() from public, anon, authenticated;
revoke all on function public.set_group_paid(uuid, uuid, boolean) from public, anon;
revoke all on function public.leave_group_order(uuid) from public, anon;
revoke all on function public.cancel_group_order(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.open_group_order(uuid, uuid, integer, text) to authenticated;
grant execute on function public.join_group_order(text) to authenticated;
grant execute on function public.set_group_items(uuid, jsonb) to authenticated;
grant execute on function public.place_group_order(uuid) to authenticated;
grant execute on function public.set_group_paid(uuid, uuid, boolean) to authenticated;
grant execute on function public.leave_group_order(uuid) to authenticated;
grant execute on function public.cancel_group_order(uuid) to authenticated;
