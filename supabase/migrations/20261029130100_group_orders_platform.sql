-- Supabase-only (skipped by db-tests): place group orders whose closing time has come, every minute.
select cron.schedule('place-due-group-orders', '* * * * *', 'select public.place_due_group_orders()');
