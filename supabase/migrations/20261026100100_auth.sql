-- Sign-up rules (build sessions 0.3 and 1.1).
-- Students must use their @nith.ac.in account. Anyone else (shop owners, staff, admins) needs an
-- admin-approved row in allowed_logins before their first sign-in.

-- Supabase "before user created" auth hook. Returns {} to allow, or an error object to reject.
-- Enabled in supabase/config.toml under [auth.hook.before_user_created].
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if v_email like '%@nith.ac.in' then
    return '{}'::jsonb;
  end if;

  if exists (select 1 from public.allowed_logins a where a.email = v_email) then
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

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;

grant select on public.allowed_logins to supabase_auth_admin;
alter table public.allowed_logins enable row level security;
create policy "auth service reads allowed logins"
  on public.allowed_logins for select to supabase_auth_admin
  using (true);

-- Creates the profile (and shop membership, for approved shop accounts) for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_approved public.allowed_logins;
begin
  select * into v_approved from public.allowed_logins where email = lower(new.email);

  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(v_approved.role, 'student')
  );

  if v_approved.shop_id is not null then
    insert into public.shop_staff (shop_id, profile_id, role)
    values (
      v_approved.shop_id,
      new.id,
      case when v_approved.role = 'merchant_owner' then 'owner' else 'counter' end::public.staff_role
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
