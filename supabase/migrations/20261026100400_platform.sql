-- Supabase-only setup. Needs pg_cron and the supabase_realtime publication, which the offline
-- PGlite tests don't have, so db-tests skip every migration whose name ends in _platform.sql.

-- Expire orders that no shop accepted within 3 minutes.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.schedule('expire-stale-orders', '* * * * *', 'select public.expire_stale_orders()');

-- Live order updates for the apps. Realtime applies the same row-level security as reads.
alter publication supabase_realtime add table public.orders, public.order_events;
