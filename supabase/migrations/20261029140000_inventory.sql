-- Stock counts, low-stock alerts and missed demand (build session 3.8).
--
-- A shop may count a size's stock (stock_qty; null means it doesn't count that size). Each order
-- takes its quantity off; an order asking for more than is left fails with a clear message, and a
-- size that reaches zero goes out of stock on its own, so it leaves the catalog without anyone
-- touching it. A rejected, cancelled or expired order puts its items back. Crossing the shop's
-- low-stock mark sends the shop a push.
--
-- search_logs records what students searched for and how many results they got, without who
-- searched, so admins and shops can see what students wanted but couldn't find.

alter table public.variants
  add column stock_qty integer check (stock_qty >= 0),
  add column low_stock_at integer not null default 3 check (low_stock_at >= 0);

create or replace function public.take_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.variants;
  v_left integer;
  v_name text;
  v_shop uuid;
begin
  if new.variant_id is null then
    return new;
  end if;
  select * into v from public.variants where id = new.variant_id for update;
  if v.stock_qty is null then
    return new;
  end if;
  select p.name, p.shop_id into v_name, v_shop from public.products p where p.id = v.product_id;
  if v.stock_qty < new.qty then
    raise exception 'Only % left of %', v.stock_qty, v_name || case when v.label <> '' then ' (' || v.label || ')' else '' end
      using errcode = 'P0001';
  end if;
  v_left := v.stock_qty - new.qty;
  update public.variants set stock_qty = v_left, in_stock = v_left > 0 where id = v.id;

  if v_left <= v.low_stock_at and v.stock_qty > v.low_stock_at then
    insert into public.push_outbox (user_id, app, title, body, data)
    select s.profile_id, 'merchant', case when v_left = 0 then 'Sold out' else 'Running low' end,
      case when v_left = 0 then v_name || ' is sold out and hidden from students.'
           else 'Only ' || v_left || ' left of ' || v_name || '.' end,
      jsonb_build_object('variantId', v.id)
    from public.shop_staff s where s.shop_id = v_shop;
  end if;
  return new;
end;
$$;

create trigger take_stock
  after insert on public.order_items
  for each row execute function public.take_stock();

-- A failed order's items go back on the shelf (only for sizes the shop counts).
create or replace function public.return_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.to_status in ('rejected', 'cancelled', 'expired') then
    update public.variants v set stock_qty = v.stock_qty + i.qty, in_stock = true
    from public.order_items i
    where i.order_id = new.order_id and i.variant_id = v.id and v.stock_qty is not null;
  end if;
  return new;
end;
$$;

create trigger return_stock
  after insert on public.order_events
  for each row execute function public.return_stock();

create table public.search_logs (
  id bigint generated always as identity primary key,
  query text not null check (length(query) between 2 and 60),
  results integer not null check (results >= 0),
  at timestamptz not null default now()
);
create index search_logs_at_idx on public.search_logs (at);

alter table public.search_logs enable row level security;

-- Students only add to the log, through log_search; nobody reads it directly.
create or replace function public.log_search(p_query text, p_results integer)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.search_logs (query, results)
  select lower(left(regexp_replace(trim(p_query), '\s+', ' ', 'g'), 60)), greatest(p_results, 0)
  where (select auth.uid()) is not null and length(trim(coalesce(p_query, ''))) >= 2;
$$;

-- What students searched for most often and found nothing, for admins and shop owners.
create or replace function public.missed_demand(p_from timestamptz, p_to timestamptz)
returns table (query text, searches integer, last_searched timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin() or exists (
    select 1 from public.shop_staff where profile_id = (select auth.uid()) and role = 'owner'
  )) then
    raise exception 'Only admins and shop owners can see this' using errcode = '42501';
  end if;
  return query
  select l.query, count(*)::integer, max(l.at)
  from public.search_logs l
  where l.results = 0 and l.at >= p_from and l.at < p_to
  group by l.query
  order by count(*) desc, max(l.at) desc
  limit 50;
end;
$$;

revoke all on function public.take_stock() from public, anon, authenticated;
revoke all on function public.return_stock() from public, anon, authenticated;
revoke all on function public.log_search(text, integer) from public, anon;
revoke all on function public.missed_demand(timestamptz, timestamptz) from public, anon;
grant execute on function public.log_search(text, integer) to authenticated;
grant execute on function public.missed_demand(timestamptz, timestamptz) to authenticated;
