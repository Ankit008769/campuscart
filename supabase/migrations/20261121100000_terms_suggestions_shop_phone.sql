-- Three additions before launch: who agreed to which version of the Terms & Conditions (and when),
-- suggestions people send the CampusCart team from the app, and the shops' phone number shown to
-- students on their orders.

-- 1. Terms & Conditions ------------------------------------------------------------------------------
-- terms_version is the newest version this person agreed to (0 = not yet). Only accept_terms sets it:
-- the profile column guard keeps people from editing it directly, so the record holds up later.
alter table public.profiles
  add column terms_version integer not null default 0 check (terms_version >= 0),
  add column terms_accepted_at timestamptz;

create or replace function public.accept_terms(p_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_version is null or p_version < 1 then
    raise exception 'Which version of the terms?' using errcode = '22023';
  end if;
  update public.profiles
  set terms_version = greatest(terms_version, p_version),
      terms_accepted_at = case when p_version > terms_version then now() else terms_accepted_at end
  where id = (select auth.uid());
end;
$$;

revoke all on function public.accept_terms(integer) from public, anon;
grant execute on function public.accept_terms(integer) to authenticated;

-- 2. Suggestions for the CampusCart team -------------------------------------------------------------
-- Anyone signed in can send one; only admins read them. Ten a day per person keeps it from being
-- used to flood the list.
create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 3 and 1000),
  created_at timestamptz not null default now(),
  -- Set by an admin once it has been read, so the list shows what is new.
  read_at timestamptz
);
create index suggestions_created_idx on public.suggestions (created_at desc);

alter table public.suggestions enable row level security;
create policy "people send their own suggestions" on public.suggestions
  for insert to authenticated with check (profile_id = (select auth.uid()) and read_at is null);
create policy "admins read suggestions" on public.suggestions
  for select to authenticated using (public.is_admin());
create policy "admins mark suggestions read" on public.suggestions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant insert (profile_id, body) on public.suggestions to authenticated;
grant select on public.suggestions to authenticated;
grant update (read_at) on public.suggestions to authenticated;

create or replace function public.limit_suggestions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.suggestions
      where profile_id = new.profile_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Thanks! That''s plenty for today. Send more tomorrow.' using errcode = 'P0001';
  end if;
  new.body := trim(new.body);
  return new;
end;
$$;
revoke all on function public.limit_suggestions() from public, anon, authenticated;

create trigger limit_suggestions
  before insert on public.suggestions
  for each row execute function public.limit_suggestions();

-- The admin list: newest first, with who sent it and how to reach them.
create or replace function public.list_suggestions(p_limit integer default 200)
returns table (id uuid, body text, created_at timestamptz, read_at timestamptz, name text, email text, phone text, role public.user_role)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can read suggestions' using errcode = '42501';
  end if;
  return query
    select s.id, s.body, s.created_at, s.read_at, p.name, p.email, p.phone, p.role
    from public.suggestions s join public.profiles p on p.id = s.profile_id
    order by s.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;
revoke all on function public.list_suggestions(integer) from public, anon;
grant execute on function public.list_suggestions(integer) to authenticated;

-- 3. The shop's phone on students' orders ----------------------------------------------------------
-- Sahil's three outlets (Booth 4 and the two copied from it) answer on one number. Admins change it
-- on the shop's page. Matches nothing on a fresh or local database.
update public.shops
set phone = '8219156808'
where phone is null
  and (id = '1b49b574-f12e-4a50-8fcf-cd452cd8f9c8'
       or name in ('Jai Santoshi Maa - Booth 4', 'Jai Santoshi Maa - SAC', 'Nescafé - Dhauladhar Hostel'));
