-- Batched deliveries (build session 3.4).
--
-- Open delivery orders headed for the same drop point are offered together, and one rider takes
-- them all in one trip: several pickups, one drop point, and each order still handed over with its
-- own code. A rider takes a batch only with no other deliveries in hand, and at most 6 orders.

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.profiles (id),
  drop_point_id uuid not null references public.drop_points (id),
  opened_at timestamptz not null default now(),
  -- Set once every order in the batch has been delivered or dropped.
  closed_at timestamptz
);

create table public.batch_orders (
  batch_id uuid not null references public.batches (id) on delete cascade,
  order_id uuid primary key references public.orders (id) on delete cascade
);
create index batch_orders_batch_idx on public.batch_orders (batch_id);

alter table public.batches enable row level security;
alter table public.batch_orders enable row level security;
create policy "riders read their own batches" on public.batches
  for select to authenticated using (rider_id = (select auth.uid()) or public.is_admin());
create policy "riders read their own batch orders" on public.batch_orders
  for select to authenticated using (
    exists (select 1 from public.batches b where b.id = batch_id and (b.rider_id = (select auth.uid()) or public.is_admin()))
  );
grant select on public.batches, public.batch_orders to authenticated;

-- Drop points with two or more open delivery orders and no rider, for an online rider. Only what
-- a rider needs to decide: where, how many, from which shops, and the pay.
create or replace function public.list_batch_offers()
returns table (
  drop_point_id uuid,
  drop_point_name text,
  orders integer,
  ready integer,
  shop_names text[],
  payout_paise integer,
  order_ids uuid[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with open_orders as (
    select o.*, public.rider_payout_for(o) as payout,
      row_number() over (partition by o.drop_point_id order by o.accepted_at, o.id) as n
    from public.orders o
    where public.is_online_rider()
      and o.mode = 'delivery' and o.rider_id is null and o.status in ('accepted', 'ready')
      and o.student_id <> (select auth.uid())
      and o.placed_at > now() - interval '2 hours'
  )
  select d.id, d.name, count(*)::integer, (count(*) filter (where o.status = 'ready'))::integer,
    array_agg(distinct s.name), sum(o.payout)::integer, array_agg(o.id order by o.n)
  from open_orders o
  join public.drop_points d on d.id = o.drop_point_id
  join public.shops s on s.id = o.shop_id
  where o.n <= 6
  group by d.id
  having count(*) >= 2
  order by count(*) desc, min(o.accepted_at);
$$;

-- Takes a batch: every order offered that is still free. Each is claimed by the same conditional
-- update as a single delivery, so an order another rider took first simply isn't in the batch.
-- Returns how many orders the rider got.
create or replace function public.claim_batch(p_drop_point_id uuid, p_order_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_batch uuid;
  v_claimed integer;
begin
  if not public.is_online_rider() then
    raise exception 'Go online to take deliveries' using errcode = '42501';
  end if;
  if exists (select 1 from public.orders where rider_id = v_user and status in ('accepted', 'ready', 'out_for_delivery')) then
    raise exception 'Finish your current deliveries before taking a batch' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_order_ids, 1), 0) not between 2 and 6 then
    raise exception 'A batch is 2 to 6 orders' using errcode = '22023';
  end if;

  insert into public.batches (rider_id, drop_point_id) values (v_user, p_drop_point_id) returning id into v_batch;
  with claimed as (
    update public.orders o set
      rider_id = v_user,
      rider_assigned_at = now(),
      rider_payout_paise = public.rider_payout_for(o)
    where o.id = any (p_order_ids)
      and o.drop_point_id = p_drop_point_id
      and o.rider_id is null
      and o.mode = 'delivery'
      and o.status in ('accepted', 'ready')
      and o.student_id <> v_user
    returning o.id, o.student_id
  ), linked as (
    insert into public.batch_orders (batch_id, order_id) select v_batch, id from claimed returning order_id
  ), told as (
    insert into public.push_outbox (user_id, app, title, body, data)
    select c.student_id, 'consumer', 'A rider is on it', 'A CampusCart rider will bring your order.',
      jsonb_build_object('orderId', c.id)
    from claimed c
    returning 1
  )
  select count(*)::integer into v_claimed from linked;

  if v_claimed = 0 then
    raise exception 'Another rider took these orders' using errcode = 'P0001';
  end if;
  return v_claimed;
end;
$$;

-- A batch closes when its last order is delivered or dropped.
create or replace function public.close_finished_batches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.to_status in ('delivered', 'collected', 'rejected', 'cancelled', 'expired') then
    update public.batches b set closed_at = now()
    where b.closed_at is null
      and b.id = (select batch_id from public.batch_orders where order_id = new.order_id)
      and not exists (
        select 1 from public.batch_orders bo join public.orders o on o.id = bo.order_id
        where bo.batch_id = b.id and o.status not in ('delivered', 'collected', 'rejected', 'cancelled', 'expired')
      );
  end if;
  return new;
end;
$$;

create trigger close_finished_batches
  after insert on public.order_events
  for each row execute function public.close_finished_batches();

revoke all on function public.list_batch_offers() from public, anon;
revoke all on function public.claim_batch(uuid, uuid[]) from public, anon;
revoke all on function public.close_finished_batches() from public, anon, authenticated;
grant execute on function public.list_batch_offers() to authenticated;
grant execute on function public.claim_batch(uuid, uuid[]) to authenticated;
