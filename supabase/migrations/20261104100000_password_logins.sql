-- Shops and admins sign in with an ID and password; Google stays for students.
--
-- An ID is an auth account <id>@logins.campuscart.invalid, so no email ever goes out. Only the
-- shop-logins function (or the Auth dashboard, for the first admin) creates these: the Auth admin
-- API doesn't run the sign-up hook, and the hook below refuses every public email sign-up. That also
-- closes the old gap where anyone could make the project email a @nith.ac.in address.
--
-- Admin powers now need the Google Authenticator step too: is_admin() is true only on a session that
-- passed it (aal2). A stolen admin password alone opens nothing, whichever client it is used from.

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_email text := lower(coalesce(event -> 'user' ->> 'email', ''));
  v_provider text := event -> 'user' -> 'app_metadata' ->> 'provider';
  v_role public.user_role;
begin
  if v_provider = 'email' then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Sign in with your @nith.ac.in college account.'
    ));
  end if;

  if v_email like '%@nith.ac.in' then
    return '{}'::jsonb;
  end if;

  select a.role into v_role from public.allowed_logins a where a.email = v_email;
  if v_role in ('merchant_owner', 'merchant_staff') then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Shops sign in with the ID and password from the CampusCart team.'
    ));
  end if;
  if found then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Sign in with your @nith.ac.in college account.'
    )
  );
end;
$$;

-- Shop approvals by Gmail are over; shop people get an ID from an admin or their owner instead.
delete from public.allowed_logins where role in ('merchant_owner', 'merchant_staff');

-- Puts a new ID at its shop. The shop-logins function calls this right after creating the account:
-- Auth saves app_metadata only after the insert, so the sign-up trigger can't see the shop.
create or replace function public.attach_shop_login(p_profile_id uuid, p_shop_id uuid, p_staff_role public.staff_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set role = case when p_staff_role = 'owner' then 'merchant_owner' else 'merchant_staff' end::public.user_role
  where id = p_profile_id;
  insert into public.shop_staff (shop_id, profile_id, role) values (p_shop_id, p_profile_id, p_staff_role);
end;
$$;

revoke all on function public.attach_shop_login(uuid, uuid, public.staff_role) from public, anon, authenticated;
grant execute on function public.attach_shop_login(uuid, uuid, public.staff_role) to service_role;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2' and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and not blocked
  );
$$;

-- Who may give out, reset or take away a shop's IDs: admins for anyone, owners for their counter staff.
create or replace function public.can_manage_shop_logins(p_shop_id uuid, p_staff_role public.staff_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or (p_staff_role = 'counter' and public.is_shop_owner(p_shop_id));
$$;

revoke all on function public.can_manage_shop_logins(uuid, public.staff_role) from public, anon;
grant execute on function public.can_manage_shop_logins(uuid, public.staff_role) to authenticated;

-- Replaced by the shop-logins function, which also creates the login and locks it on removal.
drop function public.invite_shop_staff(uuid, text);
drop function public.remove_shop_staff(uuid, uuid);
