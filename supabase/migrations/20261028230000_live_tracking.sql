-- Live rider tracking (build session 2.7).
--
-- While an order is out for delivery, the rider's phone broadcasts its position every 5 seconds on
-- the private Realtime channel track:<order id>. Nothing is stored: broadcasts pass straight to the
-- student's map. can_use_tracking_channel decides who may send and listen; the policies on
-- realtime.messages (in the _platform migration) only call it, so db-tests can check the rule.
-- Once the order is delivered (or anything else), nobody can send or listen any more.

create or replace function public.can_use_tracking_channel(p_topic text, p_send boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_order public.orders;
  v_user uuid := (select auth.uid());
begin
  if v_user is null or p_topic !~ '^track:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_order_id := substr(p_topic, 7)::uuid;
  select * into v_order from public.orders where id = v_order_id;
  if not found or v_order.status <> 'out_for_delivery' or v_order.rider_id is null then
    return false;
  end if;
  if p_send then
    return v_order.rider_id = v_user;
  end if;
  return v_user in (v_order.student_id, v_order.rider_id) or public.is_admin();
end;
$$;

revoke all on function public.can_use_tracking_channel(text, boolean) from public, anon;
grant execute on function public.can_use_tracking_channel(text, boolean) to authenticated;
