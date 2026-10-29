-- Supabase-only (skipped by db-tests): release scheduled orders to their shops every minute.
select cron.schedule('release-scheduled-orders', '* * * * *', 'select public.release_scheduled_orders()');
