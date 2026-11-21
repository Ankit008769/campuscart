-- Order lists move to private Realtime channels, so "Allow public access" can be switched off.
-- watchOrders (packages/core/src/api.ts) joins orders:<scope>:<random>, where <scope> is the
-- postgres_changes filter it listens with, or "all" for the admin board. Order rows still reach each
-- person only through the orders read policies; can_watch_orders_channel decides who may join the
-- channel at all, and the policy on realtime.messages (in the _platform migration) only calls it, so
-- db-tests can check the rule.

create or replace function public.can_watch_orders_channel(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_parts text[];
  v_column text;
  v_id uuid;
begin
  if v_user is null then
    return false;
  end if;
  if p_topic ~ '^orders:all:[a-z0-9]+$' then
    return public.is_admin();
  end if;

  v_parts := regexp_match(
    p_topic,
    '^orders:(student_id|rider_id|shop_id|cart_id|id)=eq\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):[a-z0-9]+$'
  );
  if v_parts is null then
    return false;
  end if;
  v_column := v_parts[1];
  v_id := v_parts[2]::uuid;

  return case v_column
    when 'student_id' then v_id = v_user
    when 'rider_id' then v_id = v_user
    when 'shop_id' then v_id in (select public.my_shop_ids()) or public.is_admin()
    when 'cart_id' then exists (select 1 from public.carts c where c.id = v_id and c.student_id = v_user) or public.is_admin()
    else exists (
      select 1 from public.orders o
      where o.id = v_id
        and (o.student_id = v_user or o.rider_id = v_user or o.shop_id in (select public.my_shop_ids()) or public.is_admin())
    )
  end;
end;
$$;

revoke all on function public.can_watch_orders_channel(text) from public, anon;
grant execute on function public.can_watch_orders_channel(text) to authenticated;
