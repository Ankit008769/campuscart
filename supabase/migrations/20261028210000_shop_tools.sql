-- Shop app upgrades (build session 2.11): rush mode, staff the owner manages, and owner-only reports.
--
-- Counter staff run orders and stock and can switch on rush mode; only owners see sales, commission
-- and staff. The report functions refuse counter logins, so a counter phone never shows money.

alter table public.shops
  add column rush_until timestamptz,
  add column rush_extra_minutes integer not null default 10 check (rush_extra_minutes between 0 and 60);

-- Staff may now also switch rush mode. Recreate the column guard with the longer list.
drop trigger guard_shop_columns on public.shops;
create trigger guard_shop_columns
  before update on public.shops
  for each row execute function public.guard_columns('is_open', 'hours', 'prep_minutes', 'rush_until');

create or replace function public.is_shop_owner(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.shop_staff
    where shop_id = p_shop_id and profile_id = (select auth.uid()) and role = 'owner'
  );
$$;

create policy "owners read their shop's staff" on public.shop_staff
  for select to authenticated using (public.is_shop_owner(shop_id));
create policy "owners read their staff's profiles" on public.profiles
  for select to authenticated using (
    exists (select 1 from public.shop_staff s where s.profile_id = profiles.id and public.is_shop_owner(s.shop_id))
  );

-- Lets a counter worker sign in to the shop app with this address. If they already have an
-- account they are added straight away; otherwise on their first sign-in.
create or replace function public.invite_shop_staff(p_shop_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_profile public.profiles;
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

  select * into v_profile from public.profiles where email = v_email;
  if found then
    if v_profile.role <> 'student' and v_profile.role <> 'merchant_staff' then
      raise exception 'That account already has another role' using errcode = 'P0001';
    end if;
    update public.profiles set role = 'merchant_staff' where id = v_profile.id;
    insert into public.shop_staff (shop_id, profile_id, role) values (p_shop_id, v_profile.id, 'counter')
    on conflict do nothing;
    return 'added';
  end if;

  insert into public.allowed_logins (email, role, shop_id, note)
  values (v_email, 'merchant_staff', p_shop_id, 'Added by the shop owner')
  on conflict (email) do update set role = 'merchant_staff', shop_id = excluded.shop_id;
  return 'invited';
end;
$$;

-- Takes a counter worker off the shop. Owners can't be removed this way.
create or replace function public.remove_shop_staff(p_shop_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_shop_owner(p_shop_id) then
    raise exception 'Only the shop owner can remove staff' using errcode = '42501';
  end if;
  delete from public.shop_staff where shop_id = p_shop_id and profile_id = p_profile_id and role = 'counter';
  if not found then
    raise exception 'No counter staff member like that' using errcode = 'P0002';
  end if;
  delete from public.allowed_logins
  where shop_id = p_shop_id and email = (select email from public.profiles where id = p_profile_id);
end;
$$;

-- Owner-only report: one row per day (Indian time) between p_from and p_to. Sales are the item
-- totals of completed orders, which is what the shop earns before commission; fees go to the
-- platform and riders.
create or replace function public.shop_report(p_shop_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  day date,
  orders integer,
  completed integer,
  dropped integer,
  sales_paise integer,
  commission_paise integer,
  avg_accept_seconds integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_shop_owner(p_shop_id) or public.is_admin()) then
    raise exception 'Only the shop owner can see reports' using errcode = '42501';
  end if;
  return query
  select
    (o.placed_at at time zone 'Asia/Kolkata')::date,
    count(*)::integer,
    count(*) filter (where o.status in ('delivered', 'collected'))::integer,
    count(*) filter (where o.status in ('rejected', 'cancelled', 'expired'))::integer,
    coalesce(sum(o.subtotal_paise) filter (where o.status in ('delivered', 'collected')), 0)::integer,
    coalesce(sum(o.subtotal_paise * s.commission_bps / 10000) filter (where o.status in ('delivered', 'collected')), 0)::integer,
    avg(extract(epoch from o.accepted_at - coalesce(o.released_at, o.placed_at)))::integer
  from public.orders o
  join public.shops s on s.id = o.shop_id
  where o.shop_id = p_shop_id and o.placed_at >= p_from and o.placed_at < p_to and o.status <> 'scheduled'
  group by 1
  order by 1;
end;
$$;

-- Owner-only: the best sellers between p_from and p_to, from completed orders.
create or replace function public.shop_top_items(p_shop_id uuid, p_from timestamptz, p_to timestamptz)
returns table (name text, qty integer, sales_paise integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_shop_owner(p_shop_id) or public.is_admin()) then
    raise exception 'Only the shop owner can see reports' using errcode = '42501';
  end if;
  return query
  select i.name_snapshot, sum(i.qty)::integer, sum(i.qty * i.price_paise_snapshot)::integer
  from public.order_items i
  join public.orders o on o.id = i.order_id
  where o.shop_id = p_shop_id and o.status in ('delivered', 'collected')
    and o.placed_at >= p_from and o.placed_at < p_to
  group by i.name_snapshot
  order by 3 desc
  limit 20;
end;
$$;

revoke all on function public.is_shop_owner(uuid) from public, anon;
revoke all on function public.invite_shop_staff(uuid, text) from public, anon;
revoke all on function public.remove_shop_staff(uuid, uuid) from public, anon;
revoke all on function public.shop_report(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.shop_top_items(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.is_shop_owner(uuid) to authenticated;
grant execute on function public.invite_shop_staff(uuid, text) to authenticated;
grant execute on function public.remove_shop_staff(uuid, uuid) to authenticated;
grant execute on function public.shop_report(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.shop_top_items(uuid, timestamptz, timestamptz) to authenticated;
