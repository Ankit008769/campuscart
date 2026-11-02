-- Paying at handover without losing money to riders (fraud fixes after the security review).
--
-- UPI goes straight to the shop: the student's order screen shows the shop's UPI ID (admins set it;
-- shop staff cannot change it), so a rider never receives UPI. Cash on a rider delivery is different:
-- the rider holds the shop's money until they hand it over. This tracks that cash per rider and
-- shop, lets the shop confirm what it received, and stops a rider taking more deliveries once the
-- cash they hold reaches the rider_cash_limit fee rule (₹1,000 unless admins change it).

alter table public.fee_rules drop constraint fee_rules_key_check;
alter table public.fee_rules add constraint fee_rules_key_check check (key in (
  'delivery_fee', 'small_cart_limit', 'small_cart_fee', 'platform_fee', 'rider_payout', 'night_surcharge',
  'rider_cash_limit'
));
insert into public.fee_rules (key, value_paise) values ('rider_cash_limit', 100000) on conflict (key) do nothing;

-- When the shop confirmed it received the cash a rider collected for this order, and who confirmed.
alter table public.orders
  add column rider_cash_settled_at timestamptz,
  add column rider_cash_settled_by uuid references public.profiles (id);
create index orders_rider_cash_due_idx on public.orders (rider_id, shop_id)
  where pay_method = 'cash' and status = 'delivered' and rider_id is not null and rider_cash_settled_at is null;

-- Cash a rider collected on delivered orders and hasn't handed to the shop yet.
create or replace function public.rider_cash_due_paise(p_rider_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(total_paise), 0)::integer from public.orders
  where rider_id = p_rider_id and pay_method = 'cash' and status = 'delivered' and rider_cash_settled_at is null;
$$;
revoke all on function public.rider_cash_due_paise(uuid) from public, anon, authenticated;

create or replace function public.rider_cash_limit_paise()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value_paise from public.fee_rules where key = 'rider_cash_limit'), 100000);
$$;
revoke all on function public.rider_cash_limit_paise() from public, anon, authenticated;

create or replace function public.format_rupees(p_paise integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select '₹' || case when p_paise % 100 = 0 then (p_paise / 100)::text else to_char(p_paise / 100.0, 'FM999999990.00') end;
$$;

-- Every way a rider takes an order (one delivery, a batch, anything later) sets rider_id on an order
-- that had none, so one trigger enforces the limit for all of them.
create or replace function public.check_rider_cash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due integer := public.rider_cash_due_paise(new.rider_id);
begin
  if v_due >= public.rider_cash_limit_paise() then
    raise exception 'You are holding % in cash from deliveries. Hand it to the shops before taking more.',
      public.format_rupees(v_due) using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger check_rider_cash
  before update of rider_id on public.orders
  for each row when (old.rider_id is null and new.rider_id is not null)
  execute function public.check_rider_cash();

-- The rider's own view: what they hold, per shop, and the limit.
create or replace function public.my_rider_cash()
returns table (shop_id uuid, shop_name text, orders integer, amount_paise integer, oldest_at timestamptz, limit_paise integer)
language sql
stable
security definer
set search_path = ''
as $$
  select o.shop_id, s.name, count(*)::integer, sum(o.total_paise)::integer, min(o.completed_at), public.rider_cash_limit_paise()
  from public.orders o
  join public.shops s on s.id = o.shop_id
  where o.rider_id = (select auth.uid()) and o.pay_method = 'cash' and o.status = 'delivered' and o.rider_cash_settled_at is null
  group by o.shop_id, s.name
  order by min(o.completed_at);
$$;

-- A shop's view: which riders hold its cash. Staff of the shop and admins only.
create or replace function public.shop_rider_cash(p_shop_id uuid)
returns table (rider_id uuid, rider_name text, rider_phone text, orders integer, amount_paise integer, oldest_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (p_shop_id in (select public.my_shop_ids()) or public.is_admin()) then
    raise exception 'Only this shop''s staff can see its rider cash' using errcode = '42501';
  end if;
  return query
    select o.rider_id, p.name, p.phone, count(*)::integer, sum(o.total_paise)::integer, min(o.completed_at)
    from public.orders o
    join public.profiles p on p.id = o.rider_id
    where o.shop_id = p_shop_id and o.pay_method = 'cash' and o.status = 'delivered'
      and o.rider_id is not null and o.rider_cash_settled_at is null
    group by o.rider_id, p.name, p.phone
    order by min(o.completed_at);
end;
$$;

-- The shop confirms it received a rider's cash: everything that rider holds for this shop is
-- settled at once, and the rider gets a push so they can dispute a wrong amount. Returns the amount.
create or replace function public.settle_rider_cash(p_shop_id uuid, p_rider_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_amount integer;
  v_shop_name text;
begin
  if not (p_shop_id in (select public.my_shop_ids()) or public.is_admin()) then
    raise exception 'Only this shop''s staff can confirm rider cash' using errcode = '42501';
  end if;

  with settled as (
    update public.orders set rider_cash_settled_at = now(), rider_cash_settled_by = v_user
    where shop_id = p_shop_id and rider_id = p_rider_id and pay_method = 'cash' and status = 'delivered'
      and rider_cash_settled_at is null
    returning total_paise
  )
  select coalesce(sum(total_paise), 0)::integer into v_amount from settled;
  if v_amount = 0 then
    raise exception 'This rider has no cash to hand over for this shop' using errcode = 'P0001';
  end if;

  select name into v_shop_name from public.shops where id = p_shop_id;
  insert into public.push_outbox (user_id, app, title, body, data)
  values (p_rider_id, 'consumer', 'Cash handed over',
          v_shop_name || ' confirmed receiving ' || public.format_rupees(v_amount) || ' from you.',
          jsonb_build_object('screen', 'rider'));
  return v_amount;
end;
$$;

-- Admins: every rider holding cash, per shop, oldest first.
create or replace function public.rider_cash_report()
returns table (rider_id uuid, rider_name text, rider_phone text, shop_id uuid, shop_name text, orders integer, amount_paise integer, oldest_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see rider cash' using errcode = '42501';
  end if;
  return query
    select o.rider_id, p.name, p.phone, o.shop_id, s.name, count(*)::integer, sum(o.total_paise)::integer, min(o.completed_at)
    from public.orders o
    join public.profiles p on p.id = o.rider_id
    join public.shops s on s.id = o.shop_id
    where o.pay_method = 'cash' and o.status = 'delivered' and o.rider_id is not null and o.rider_cash_settled_at is null
    group by o.rider_id, p.name, p.phone, o.shop_id, s.name
    order by min(o.completed_at);
end;
$$;

revoke all on function public.my_rider_cash() from public, anon;
revoke all on function public.shop_rider_cash(uuid) from public, anon;
revoke all on function public.settle_rider_cash(uuid, uuid) from public, anon;
revoke all on function public.rider_cash_report() from public, anon;
grant execute on function public.my_rider_cash() to authenticated;
grant execute on function public.shop_rider_cash(uuid) to authenticated;
grant execute on function public.settle_rider_cash(uuid, uuid) to authenticated;
grant execute on function public.rider_cash_report() to authenticated;
