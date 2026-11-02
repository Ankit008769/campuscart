-- Supabase-only half of private order channels (skipped by db-tests): who may join the private
-- orders:<scope>:<random> channels that watchOrders opens. Nobody gets an insert policy, so nobody can
-- broadcast on them; the order rows themselves arrive as postgres_changes, filtered by the orders
-- read policies.

create policy "people join the order lists they may watch" on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.can_watch_orders_channel((select realtime.topic())));
