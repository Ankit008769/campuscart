-- Shop hours and order search for the admin panel (build session 1.11).

-- Shop hours are {"opens": "09:00", "closes": "23:00", "closed_days": ["sun"]} in Indian time, or
-- {} when the shop hasn't set any. Closing earlier than opening means the shop runs past midnight
-- (a night canteen open 20:00 to 02:00). Equal times mean open all day.
create or replace function public.valid_shop_hours(p_hours jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_hours = '{}'::jsonb or (
    jsonb_typeof(p_hours) = 'object'
    and coalesce(p_hours ->> 'opens', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and coalesce(p_hours ->> 'closes', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and coalesce(jsonb_typeof(p_hours -> 'closed_days'), 'array') = 'array'
    and not exists (
      select 1 from jsonb_array_elements_text(coalesce(p_hours -> 'closed_days', '[]'::jsonb)) as day
      where day not in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
    )
  );
$$;

alter table public.shops add constraint shops_hours_valid check (public.valid_shop_hours(hours));

-- Whether a shop with these hours is within them at p_at. No hours set counts as always within.
create or replace function public.within_shop_hours(p_hours jsonb, p_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  with t as (
    select
      (p_hours ->> 'opens')::time as opens,
      (p_hours ->> 'closes')::time as closes,
      coalesce(p_hours -> 'closed_days', '[]'::jsonb) as closed_days,
      (p_at at time zone 'Asia/Kolkata') as local
  )
  select case
    when p_hours = '{}'::jsonb then true
    when t.opens = t.closes then not (t.closed_days ? lower(to_char(t.local, 'Dy')))
    when t.opens < t.closes then
      t.local::time >= t.opens and t.local::time < t.closes
      and not (t.closed_days ? lower(to_char(t.local, 'Dy')))
    -- Past midnight: the evening belongs to today's opening, the small hours to yesterday's.
    else
      (t.local::time >= t.opens and not (t.closed_days ? lower(to_char(t.local, 'Dy'))))
      or (t.local::time < t.closes and not (t.closed_days ? lower(to_char(t.local - interval '1 day', 'Dy'))))
  end
  from t;
$$;

-- Switches off shops still marked open after their hours, so a shop that forgot the switch doesn't
-- collect orders that then expire. It never opens a shop: someone has to be at the counter.
-- Returns how many shops it closed. pg_cron runs it (see the _platform migration).
create or replace function public.close_shops_after_hours(p_at timestamptz default now())
returns integer
language sql
security definer
set search_path = ''
as $$
  with closed as (
    update public.shops
    set is_open = false
    where is_open and hours <> '{}'::jsonb and not public.within_shop_hours(hours, p_at)
    returning id
  )
  select count(*)::integer from closed;
$$;

-- Order search for the admin panel: by order code, student name, email or phone digits, with
-- optional shop, status and date filters. Runs as the caller, so admins search every order and
-- anyone else only the orders row-level security already shows them.
create or replace function public.search_orders(
  p_query text default null,
  p_shop_id uuid default null,
  p_status public.order_status default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  id uuid,
  code text,
  status public.order_status,
  mode public.order_mode,
  total_paise integer,
  placed_at timestamptz,
  shop_name text,
  student_name text,
  student_email text,
  student_phone text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select
      nullif(trim(p_query), '') as text,
      nullif(regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g'), '') as digits
  )
  select o.id, o.code, o.status, o.mode, o.total_paise, o.placed_at, s.name, p.name, p.email, p.phone
  from public.orders o
  join public.shops s on s.id = o.shop_id
  left join public.profiles p on p.id = o.student_id
  cross join q
  where (p_shop_id is null or o.shop_id = p_shop_id)
    and (p_status is null or o.status = p_status)
    and (p_from is null or o.placed_at >= p_from)
    and (p_to is null or o.placed_at < p_to)
    and (
      q.text is null
      or o.code ilike '%' || q.text || '%'
      or p.name ilike '%' || q.text || '%'
      or p.email ilike '%' || q.text || '%'
      or (length(q.digits) >= 4 and regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') like '%' || q.digits || '%')
    )
  order by o.placed_at desc
  limit 100;
$$;

revoke all on function public.valid_shop_hours(jsonb) from public, anon;
revoke all on function public.within_shop_hours(jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.close_shops_after_hours(timestamptz) from public, anon, authenticated;
revoke all on function public.search_orders(text, uuid, public.order_status, timestamptz, timestamptz) from public, anon;
grant execute on function public.search_orders(text, uuid, public.order_status, timestamptz, timestamptz) to authenticated;
-- The shops_hours_valid check runs as whoever updates a shop, so staff need it too.
grant execute on function public.valid_shop_hours(jsonb) to authenticated;
