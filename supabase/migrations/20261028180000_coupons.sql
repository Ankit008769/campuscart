-- Coupons inside place_order (build session 2.9).
--
-- coupon_discount is the only place a discount is worked out: the cart preview and place_order
-- both call it, so a code the preview accepts is priced the same way when the order is placed.
-- place_order locks the coupon while it checks the usage limits, so two orders at once cannot
-- push a coupon past its limit. Fees are worked out on the item total before the discount
-- (calculate_bill is unchanged), and the discount comes off the total. It never exceeds the items.

create table public.coupons (
  code text primary key check (code ~ '^[A-Z0-9]{3,20}$'),
  description text not null default '',
  kind text not null check (kind in ('flat', 'percent')),
  -- Paise for flat coupons, a whole percent (1 to 100) for percent coupons.
  value integer not null check (value > 0),
  max_discount_paise integer check (max_discount_paise > 0),
  min_subtotal_paise integer not null default 0 check (min_subtotal_paise >= 0),
  -- A shop's own coupon works only there; null works at every shop.
  shop_id uuid references public.shops (id) on delete cascade,
  -- Who pays for the discount when shops are settled.
  funded_by text not null default 'platform' check (funded_by in ('platform', 'shop')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  max_uses integer check (max_uses > 0),
  per_student_limit integer not null default 1 check (per_student_limit > 0),
  first_order_only boolean not null default false,
  -- Listed coupons show up in the app; unlisted ones work only for people who know the code.
  listed boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (kind = 'flat' or value <= 100),
  check (ends_at is null or ends_at > starts_at)
);

create table public.coupon_redemptions (
  order_id uuid primary key references public.orders (id) on delete cascade,
  coupon_code text not null references public.coupons (code),
  student_id uuid not null references public.profiles (id),
  discount_paise integer not null check (discount_paise > 0),
  at timestamptz not null default now()
);
create index coupon_redemptions_code_idx on public.coupon_redemptions (coupon_code, student_id);

alter table public.orders
  add column discount_paise integer not null default 0,
  add column coupon_code text references public.coupons (code);

-- The bill now subtracts the discount. Replace the original unnamed total check.
do $$
declare
  v_name text;
begin
  select conname into v_name from pg_constraint
  where conrelid = 'public.orders'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%total_paise = %';
  execute format('alter table public.orders drop constraint %I', v_name);
end;
$$;
alter table public.orders
  add constraint orders_total_matches_bill
    check (total_paise = subtotal_paise + delivery_fee_paise + small_cart_fee_paise + platform_fee_paise - discount_paise),
  add constraint orders_discount_within_items check (discount_paise between 0 and subtotal_paise);

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;

create policy "admins manage coupons" on public.coupons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "everyone reads listed coupons that are running" on public.coupons
  for select to authenticated
  using (listed and active and starts_at <= now() and (ends_at is null or ends_at > now()));
create policy "shops read their own coupons" on public.coupons
  for select to authenticated using (shop_id in (select public.my_shop_ids()));
create policy "read redemptions of visible orders" on public.coupon_redemptions
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = coupon_redemptions.order_id));
grant select on public.coupons, public.coupon_redemptions to authenticated;
grant insert, update, delete on public.coupons to authenticated;

-- The discount a coupon gives this student at this shop for this item total, or an exception that
-- says why it can't be used. Redemptions on rejected, cancelled or expired orders don't count.
create or replace function public.coupon_discount(p_code text, p_student uuid, p_shop_id uuid, p_subtotal integer)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.coupons;
  v_discount integer;
begin
  select * into c from public.coupons where code = upper(trim(p_code));
  if not found or not c.active then
    raise exception 'That coupon code doesn''t exist' using errcode = 'P0001';
  end if;
  if now() < c.starts_at then
    raise exception 'This coupon starts on %', to_char(c.starts_at at time zone 'Asia/Kolkata', 'DD Mon') using errcode = 'P0001';
  end if;
  if c.ends_at is not null and now() >= c.ends_at then
    raise exception 'This coupon has expired' using errcode = 'P0001';
  end if;
  if c.shop_id is not null and c.shop_id <> p_shop_id then
    raise exception 'This coupon works only at %', (select name from public.shops where id = c.shop_id) using errcode = 'P0001';
  end if;
  if p_subtotal < c.min_subtotal_paise then
    raise exception 'Add items worth % or more to use this coupon', public.rupees_text(c.min_subtotal_paise) using errcode = 'P0001';
  end if;
  if c.max_uses is not null and (
    select count(*) from public.coupon_redemptions r join public.orders o on o.id = r.order_id
    where r.coupon_code = c.code and o.status not in ('rejected', 'cancelled', 'expired')
  ) >= c.max_uses then
    raise exception 'This coupon has been used up' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.coupon_redemptions r join public.orders o on o.id = r.order_id
    where r.coupon_code = c.code and r.student_id = p_student and o.status not in ('rejected', 'cancelled', 'expired')
  ) >= c.per_student_limit then
    raise exception 'You have already used this coupon' using errcode = 'P0001';
  end if;
  if c.first_order_only and exists (
    select 1 from public.orders o where o.student_id = p_student and o.status not in ('rejected', 'cancelled', 'expired')
  ) then
    raise exception 'This coupon is for your first order' using errcode = 'P0001';
  end if;

  v_discount := case c.kind when 'flat' then c.value else (p_subtotal * c.value) / 100 end;
  if c.max_discount_paise is not null then
    v_discount := least(v_discount, c.max_discount_paise);
  end if;
  return least(v_discount, p_subtotal);
end;
$$;

-- For the cart: what this coupon would take off, or why it can't be used.
create or replace function public.preview_coupon(p_code text, p_shop_id uuid, p_subtotal_paise integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select public.coupon_discount(p_code, (select auth.uid()), p_shop_id, p_subtotal_paise);
$$;

-- place_order gains p_coupon_code. The signature changes, so the old one goes first.
drop function public.place_order(uuid, public.order_mode, public.pay_method, jsonb, uuid, text);

create function public.place_order(
  p_shop_id uuid,
  p_mode public.order_mode,
  p_pay_method public.pay_method,
  p_items jsonb,
  p_drop_point_id uuid default null,
  p_room_note text default null,
  p_coupon_code text default null
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

  if v_coupon is not null then
    -- Hold the coupon until this order commits, so concurrent orders can't overshoot its limits.
    perform 1 from public.coupons where code = v_coupon for update;
    v_discount := public.coupon_discount(v_coupon, v_user, p_shop_id, v_subtotal);
  end if;

  insert into public.shop_daily_counters as c (shop_id, day, last_token)
  values (p_shop_id, (now() at time zone 'Asia/Kolkata')::date, 1)
  on conflict (shop_id, day) do update set last_token = c.last_token + 1
  returning c.last_token into v_token;

  insert into public.orders (
    code, student_id, shop_id, mode, drop_point_id, room_note, pay_method,
    subtotal_paise, delivery_fee_paise, small_cart_fee_paise, platform_fee_paise,
    discount_paise, coupon_code, total_paise, token_no
  )
  values (
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    v_user, p_shop_id, p_mode, p_drop_point_id,
    case when p_mode = 'delivery' then coalesce(nullif(trim(p_room_note), ''), v_profile.room_note) end,
    p_pay_method,
    v_bill.subtotal_paise, v_bill.delivery_fee_paise, v_bill.small_cart_fee_paise, v_bill.platform_fee_paise,
    v_discount, case when v_discount > 0 then v_coupon end, v_bill.total_paise - v_discount, v_token
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
  values (v_order.id, null, 'placed', 'student', v_user);

  return v_order;
end;
$$;

revoke all on function public.coupon_discount(text, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.preview_coupon(text, uuid, integer) from public, anon;
revoke all on function public.place_order(uuid, public.order_mode, public.pay_method, jsonb, uuid, text, text) from public, anon;
grant execute on function public.preview_coupon(text, uuid, integer) to authenticated;
grant execute on function public.place_order(uuid, public.order_mode, public.pay_method, jsonb, uuid, text, text) to authenticated;
