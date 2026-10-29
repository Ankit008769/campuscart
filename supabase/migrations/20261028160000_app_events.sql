-- Where students drop off between opening the app and ordering (build session 1.13).
--
-- The student app logs four steps; the last step, ordering, comes from the orders table itself.
-- Each row holds only who, which step, which shop and when: no search text, device or location.

create table public.app_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (name in ('app_open', 'shop_view', 'add_to_cart', 'checkout_view')),
  shop_id uuid references public.shops (id) on delete set null,
  at timestamptz not null default now()
);
create index app_events_at_idx on public.app_events (at);

alter table public.app_events enable row level security;
create policy "people log their own events" on public.app_events
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "admins read events" on public.app_events
  for select to authenticated using (public.is_admin());
grant insert, select on public.app_events to authenticated;

-- Distinct students at each step between p_from and p_to, in funnel order. Runs as the caller,
-- so only admins see any numbers.
create or replace function public.funnel_report(p_from timestamptz, p_to timestamptz)
returns table (step text, students integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.step,
    case when s.step = 'ordered' then (
      select count(distinct o.student_id)::integer
      from public.orders o
      where o.placed_at >= p_from and o.placed_at < p_to
    ) else (
      select count(distinct e.user_id)::integer
      from public.app_events e
      where e.name = s.step and e.at >= p_from and e.at < p_to
    ) end
  from unnest(array['app_open', 'shop_view', 'add_to_cart', 'checkout_view', 'ordered']) with ordinality as s(step, n)
  order by s.n;
$$;

revoke all on function public.funnel_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.funnel_report(timestamptz, timestamptz) to authenticated;
