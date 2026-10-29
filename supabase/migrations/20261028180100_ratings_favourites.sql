-- Ratings, favourites, buy again and back-in-stock alerts (build session 2.9).

-- One rating per completed order, from its student, within 7 days of completion. They can change
-- it inside that window. The rider gets stars only if a rider delivered it.
create table public.order_ratings (
  order_id uuid primary key references public.orders (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  rider_id uuid references public.profiles (id) on delete set null,
  shop_stars smallint not null check (shop_stars between 1 and 5),
  rider_stars smallint check (rider_stars between 1 and 5),
  comment text check (length(comment) <= 300),
  at timestamptz not null default now()
);
create index order_ratings_shop_idx on public.order_ratings (shop_id, at);

create table public.favourites (
  student_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, product_id)
);

create table public.stock_alerts (
  student_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  variant_id uuid not null references public.variants (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, variant_id)
);

alter table public.order_ratings enable row level security;
alter table public.favourites enable row level security;
alter table public.stock_alerts enable row level security;

create policy "students, their shop, their rider and admins read ratings" on public.order_ratings
  for select to authenticated using (
    student_id = (select auth.uid())
    or rider_id = (select auth.uid())
    or shop_id in (select public.my_shop_ids())
    or public.is_admin()
  );
create policy "students manage their favourites" on public.favourites
  for all to authenticated using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));
create policy "students manage their stock alerts" on public.stock_alerts
  for all to authenticated using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));
grant select on public.order_ratings to authenticated;
grant select, insert, delete on public.favourites, public.stock_alerts to authenticated;

create or replace function public.rate_order(
  p_order_id uuid,
  p_shop_stars integer,
  p_rider_stars integer default null,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id and student_id = (select auth.uid());
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if o.status not in ('delivered', 'collected') then
    raise exception 'You can rate an order once you have it' using errcode = 'P0001';
  end if;
  if o.completed_at < now() - interval '7 days' then
    raise exception 'Orders can be rated for 7 days' using errcode = 'P0001';
  end if;
  if p_shop_stars is null or p_shop_stars not between 1 and 5 then
    raise exception 'Give the shop 1 to 5 stars' using errcode = '22023';
  end if;
  if p_rider_stars is not null and (o.rider_id is null or p_rider_stars not between 1 and 5) then
    raise exception 'Rider stars are 1 to 5, for orders a rider delivered' using errcode = '22023';
  end if;
  insert into public.order_ratings (order_id, student_id, shop_id, rider_id, shop_stars, rider_stars, comment)
  values (o.id, o.student_id, o.shop_id, o.rider_id, p_shop_stars, p_rider_stars, nullif(trim(p_comment), ''))
  on conflict (order_id) do update set
    shop_stars = excluded.shop_stars,
    rider_stars = excluded.rider_stars,
    comment = excluded.comment,
    at = now();
end;
$$;

-- Average stars per shop over the last 90 days, for shop cards. Shops with fewer than 3 ratings are
-- left out, so one unhappy order doesn't define a shop.
create or replace function public.shop_ratings()
returns table (shop_id uuid, average numeric, ratings integer)
language sql
stable
security definer
set search_path = ''
as $$
  select r.shop_id, round(avg(r.shop_stars), 1), count(*)::integer
  from public.order_ratings r
  where r.at > now() - interval '90 days'
  group by r.shop_id
  having count(*) >= 3;
$$;

-- Items the student had in completed orders over the last 60 days that are on sale now, latest
-- first. Runs as the caller: row-level security keeps it to their own orders and active items.
create or replace function public.buy_again()
returns table (
  variant_id uuid,
  product_id uuid,
  product_name text,
  label text,
  price_paise integer,
  image_path text,
  photo_credit text,
  photo_source_url text,
  shop_id uuid,
  shop_name text,
  shop_is_open boolean,
  last_ordered_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.id, p.id, p.name, v.label, v.price_paise, p.image_path, p.photo_credit, p.photo_source_url,
    s.id, s.name, s.is_open, max(o.placed_at)
  from public.orders o
  join public.order_items i on i.order_id = o.id
  join public.variants v on v.id = i.variant_id
  join public.products p on p.id = v.product_id
  join public.shops s on s.id = p.shop_id
  where o.student_id = (select auth.uid())
    and o.status in ('delivered', 'collected')
    and o.placed_at > now() - interval '60 days'
    and p.active and v.in_stock
  group by v.id, p.id, s.id
  order by max(o.placed_at) desc
  limit 20;
$$;

-- When a size comes back in stock, tell everyone who asked, then forget their alerts.
create or replace function public.notify_back_in_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  with alerts as (
    delete from public.stock_alerts where variant_id = new.id returning student_id
  )
  insert into public.push_outbox (user_id, app, title, body, data)
  select a.student_id, 'consumer', 'Back in stock',
    p.name || case when new.label <> '' then ' (' || new.label || ')' else '' end || ' is back at ' || s.name || '.',
    jsonb_build_object('shopId', s.id)
  from alerts a
  join public.products p on p.id = new.product_id
  join public.shops s on s.id = p.shop_id;
  return new;
exception when others then
  raise warning 'notify_back_in_stock skipped variant %: %', new.id, sqlerrm;
  return new;
end;
$$;

create trigger notify_back_in_stock
  after update of in_stock on public.variants
  for each row
  when (old.in_stock = false and new.in_stock = true)
  execute function public.notify_back_in_stock();

revoke all on function public.rate_order(uuid, integer, integer, text) from public, anon;
revoke all on function public.shop_ratings() from public, anon;
revoke all on function public.buy_again() from public, anon;
revoke all on function public.notify_back_in_stock() from public, anon, authenticated;
grant execute on function public.rate_order(uuid, integer, integer, text) to authenticated;
grant execute on function public.shop_ratings() to authenticated;
grant execute on function public.buy_again() to authenticated;
