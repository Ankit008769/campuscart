-- Banners and push campaigns ops can run without a developer (build session 2.12).
--
-- Both can be aimed at everyone, one hostel (the students whose usual drop point it is) or one
-- batch (the admission year at the start of a roll-number email, 22bec045 → 22).

-- The batch of a student account, or null for addresses that aren't roll numbers.
create or replace function public.student_batch(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select substring(lower(p_email) from '^([0-9]{2})[a-z]+[0-9]+@nith\.ac\.in$');
$$;

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 60),
  body text not null default '' check (length(body) <= 140),
  -- Where tapping the banner goes: a shop, a category, or nowhere.
  shop_id uuid references public.shops (id) on delete cascade,
  category_id uuid references public.categories (id) on delete cascade,
  drop_point_id uuid references public.drop_points (id) on delete cascade,
  batch text check (batch ~ '^[0-9]{2}$'),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (shop_id is null or category_id is null)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 60),
  body text not null check (length(body) between 1 and 140),
  drop_point_id uuid references public.drop_points (id),
  batch text check (batch ~ '^[0-9]{2}$'),
  sent_by uuid not null references public.profiles (id),
  sent_at timestamptz not null default now(),
  recipients integer not null
);

alter table public.banners enable row level security;
alter table public.campaigns enable row level security;
create policy "admins manage banners" on public.banners
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins read campaigns" on public.campaigns
  for select to authenticated using (public.is_admin());
grant select, insert, update, delete on public.banners to authenticated;
grant select on public.campaigns to authenticated;

-- Running banners meant for the signed-in student, newest first.
create or replace function public.my_banners()
returns table (id uuid, title text, body text, shop_id uuid, category_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.title, b.body, b.shop_id, b.category_id
  from public.banners b
  join public.profiles p on p.id = (select auth.uid())
  where b.active and b.starts_at <= now() and (b.ends_at is null or b.ends_at > now())
    and (b.drop_point_id is null or b.drop_point_id = p.default_drop_point_id)
    and (b.batch is null or b.batch = public.student_batch(p.email))
  order by b.created_at desc
  limit 5;
$$;

-- Sends a push to every student in the audience (send-push delivers it to their phones). At most
-- 3 campaigns a day, so students don't learn to ignore CampusCart. Returns how many students.
create or replace function public.send_campaign(
  p_title text,
  p_body text,
  p_drop_point_id uuid default null,
  p_batch text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins can send campaigns' using errcode = '42501';
  end if;
  if (select count(*) from public.campaigns where sent_at > now() - interval '1 day') >= 3 then
    raise exception 'Three campaigns went out in the last 24 hours. Wait before sending another.' using errcode = 'P0001';
  end if;

  with audience as (
    select p.id from public.profiles p
    where p.role = 'student' and not p.blocked
      and (p_drop_point_id is null or p.default_drop_point_id = p_drop_point_id)
      and (p_batch is null or public.student_batch(p.email) = p_batch)
  ), queued as (
    insert into public.push_outbox (user_id, app, title, body, data)
    select a.id, 'consumer', trim(p_title), trim(p_body), '{"campaign": true}'::jsonb from audience a
    returning 1
  )
  select count(*)::integer into v_count from queued;

  insert into public.campaigns (title, body, drop_point_id, batch, sent_by, recipients)
  values (trim(p_title), trim(p_body), p_drop_point_id, p_batch, (select auth.uid()), v_count);
  return v_count;
end;
$$;

revoke all on function public.student_batch(text) from public, anon, authenticated;
revoke all on function public.my_banners() from public, anon;
revoke all on function public.send_campaign(text, text, uuid, text) from public, anon;
grant execute on function public.my_banners() to authenticated;
grant execute on function public.send_campaign(text, text, uuid, text) to authenticated;
