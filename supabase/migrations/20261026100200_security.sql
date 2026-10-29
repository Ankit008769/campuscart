-- Who can read and change what (build session 1.1).
-- Deny by default: anon gets nothing, authenticated gets only the grants below, and row-level
-- security narrows every table to the rows that person may see.

-- helpers -----------------------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and not blocked
  );
$$;

create or replace function public.my_shop_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select shop_id from public.shop_staff where profile_id = (select auth.uid());
$$;

-- Non-admins may change only the listed columns. Runs as the caller, so service-role and
-- migration writes pass through.
create or replace function public.guard_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_allowed text[] := tg_argv;
begin
  if current_user in ('anon', 'authenticated')
     and not public.is_admin()
     and (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'Only admins can change this' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_shop_columns
  before update on public.shops
  for each row execute function public.guard_columns('is_open', 'hours', 'prep_minutes');

create trigger guard_profile_columns
  before update on public.profiles
  for each row execute function public.guard_columns('name', 'phone', 'default_drop_point_id', 'room_note');

-- privileges --------------------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on
  public.drop_points, public.fee_rules, public.walk_times, public.categories,
  public.shops, public.shop_staff, public.allowed_logins, public.profiles,
  public.products, public.variants,
  public.orders, public.order_items, public.order_events, public.order_secrets,
  public.device_tokens
to authenticated;

grant insert, update, delete on
  public.drop_points, public.fee_rules, public.walk_times, public.categories,
  public.shops, public.shop_staff, public.allowed_logins,
  public.products, public.variants, public.device_tokens
to authenticated;

-- Profiles are created by the sign-up trigger; people only edit them.
grant update on public.profiles to authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_shop_ids() to authenticated;
-- The hook revoke above removed this grant; Supabase Auth still needs it.
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- row-level security ------------------------------------------------------------------------------

alter table public.drop_points enable row level security;
alter table public.fee_rules enable row level security;
alter table public.walk_times enable row level security;
alter table public.categories enable row level security;
alter table public.shops enable row level security;
alter table public.shop_staff enable row level security;
alter table public.allowed_logins enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.order_secrets enable row level security;
alter table public.shop_daily_counters enable row level security;
alter table public.device_tokens enable row level security;

-- Reference data: everyone signed in reads it, admins maintain it.
create policy "signed-in users read drop points" on public.drop_points
  for select to authenticated using (true);
create policy "admins manage drop points" on public.drop_points
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "signed-in users read fee rules" on public.fee_rules
  for select to authenticated using (true);
create policy "admins manage fee rules" on public.fee_rules
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "signed-in users read walk times" on public.walk_times
  for select to authenticated using (true);
create policy "admins manage walk times" on public.walk_times
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "signed-in users read categories" on public.categories
  for select to authenticated using (true);
create policy "admins manage categories" on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Shops: everyone reads; staff update their own shop (guarded columns); admins do the rest.
create policy "signed-in users read shops" on public.shops
  for select to authenticated using (true);
create policy "staff and admins update shops" on public.shops
  for update to authenticated
  using (public.is_admin() or id in (select public.my_shop_ids()))
  with check (public.is_admin() or id in (select public.my_shop_ids()));
create policy "admins add shops" on public.shops
  for insert to authenticated with check (public.is_admin());
create policy "admins remove shops" on public.shops
  for delete to authenticated using (public.is_admin());

create policy "staff read own memberships" on public.shop_staff
  for select to authenticated using (profile_id = (select auth.uid()) or public.is_admin());
create policy "admins manage staff" on public.shop_staff
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins manage allowed logins" on public.allowed_logins
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Profiles: your own, your shop's customers, or everyone for admins.
create policy "users read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "admins read profiles" on public.profiles
  for select to authenticated using (public.is_admin());
create policy "shops read their customers" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.orders o
      where o.student_id = profiles.id and o.shop_id in (select public.my_shop_ids())
    )
  );
create policy "users update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "admins update profiles" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Catalog: students see active items; staff see and edit their own shop's; admins everything.
create policy "read active or own products" on public.products
  for select to authenticated
  using (active or shop_id in (select public.my_shop_ids()) or public.is_admin());
create policy "staff and admins add products" on public.products
  for insert to authenticated
  with check (shop_id in (select public.my_shop_ids()) or public.is_admin());
create policy "staff and admins edit products" on public.products
  for update to authenticated
  using (shop_id in (select public.my_shop_ids()) or public.is_admin())
  with check (shop_id in (select public.my_shop_ids()) or public.is_admin());
create policy "staff and admins remove products" on public.products
  for delete to authenticated
  using (shop_id in (select public.my_shop_ids()) or public.is_admin());

create policy "read variants of visible products" on public.variants
  for select to authenticated
  using (exists (select 1 from public.products p where p.id = variants.product_id));
create policy "staff and admins manage variants" on public.variants
  for all to authenticated
  using (exists (
    select 1 from public.products p
    where p.id = variants.product_id
      and (p.shop_id in (select public.my_shop_ids()) or public.is_admin())
  ))
  with check (exists (
    select 1 from public.products p
    where p.id = variants.product_id
      and (p.shop_id in (select public.my_shop_ids()) or public.is_admin())
  ));

-- Orders are read-only for everyone; place_order and transition_order make every change.
create policy "students read own orders" on public.orders
  for select to authenticated using (student_id = (select auth.uid()));
create policy "shops read their orders" on public.orders
  for select to authenticated using (shop_id in (select public.my_shop_ids()));
create policy "admins read all orders" on public.orders
  for select to authenticated using (public.is_admin());

create policy "read items of visible orders" on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id));

create policy "read events of visible orders" on public.order_events
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_events.order_id));

create policy "students read their delivery code" on public.order_secrets
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_secrets.order_id and o.student_id = (select auth.uid())
    )
    or public.is_admin()
  );

create policy "users manage own device tokens" on public.device_tokens
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- shop_daily_counters: no policies, so only the order engine (security definer) touches it.
