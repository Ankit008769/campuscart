-- Supabase-only (skipped by db-tests): every 5 minutes, switch off shops whose hours have ended.
select cron.schedule('close-shops-after-hours', '*/5 * * * *', 'select public.close_shops_after_hours()');
