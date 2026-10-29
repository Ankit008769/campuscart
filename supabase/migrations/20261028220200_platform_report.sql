-- The admin reports dashboard (build session 2.12): one row per day (Indian time) across all shops.
-- Sales are what students paid for completed orders; CampusCart's share is commission plus fees,
-- less the discounts it funded.
create or replace function public.platform_report(p_from timestamptz, p_to timestamptz)
returns table (
  day date,
  orders integer,
  completed integer,
  dropped integer,
  sales_paise integer,
  commission_paise integer,
  fees_paise integer,
  platform_discount_paise integer,
  new_students integer,
  avg_accept_seconds integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see platform reports' using errcode = '42501';
  end if;
  return query
  with days as (
    select generate_series(
      (p_from at time zone 'Asia/Kolkata')::date,
      ((p_to - interval '1 microsecond') at time zone 'Asia/Kolkata')::date,
      interval '1 day'
    )::date as day
  ), o as (
    select (o.placed_at at time zone 'Asia/Kolkata')::date as day, o.*, s.commission_bps,
      o.status in ('delivered', 'collected') as done,
      coalesce((select c.funded_by from public.coupons c where c.code = o.coupon_code), 'platform') as funded_by
    from public.orders o join public.shops s on s.id = o.shop_id
    where o.placed_at >= p_from and o.placed_at < p_to and o.status <> 'scheduled'
  ), students as (
    select (p.created_at at time zone 'Asia/Kolkata')::date as day, count(*)::integer as n
    from public.profiles p
    where p.role = 'student' and p.created_at >= p_from and p.created_at < p_to
    group by 1
  )
  select d.day,
    count(o.id)::integer,
    (count(o.id) filter (where o.done))::integer,
    (count(o.id) filter (where o.status in ('rejected', 'cancelled', 'expired')))::integer,
    coalesce(sum(o.total_paise) filter (where o.done), 0)::integer,
    coalesce(sum(o.subtotal_paise * o.commission_bps / 10000) filter (where o.done), 0)::integer,
    coalesce(sum(o.delivery_fee_paise + o.small_cart_fee_paise + o.platform_fee_paise + o.surcharge_paise) filter (where o.done), 0)::integer,
    coalesce(sum(o.discount_paise) filter (where o.done and o.funded_by = 'platform'), 0)::integer,
    coalesce(max(st.n), 0)::integer,
    avg(extract(epoch from o.accepted_at - coalesce(o.released_at, o.placed_at)))::integer
  from days d
  left join o on o.day = d.day
  left join students st on st.day = d.day
  group by d.day
  order by d.day;
end;
$$;

revoke all on function public.platform_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.platform_report(timestamptz, timestamptz) to authenticated;
