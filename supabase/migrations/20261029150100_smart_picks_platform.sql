-- Supabase-only (skipped by db-tests): rebuild "often bought together" every night at 3:30 AM IST.
select cron.schedule('refresh-smart-picks', '0 22 * * *', 'select public.refresh_smart_picks()');
