-- Opens shops at their opening time, every 5 minutes (open_shops_at_opening looks back exactly 5).
select cron.schedule('open-shops-at-opening', '*/5 * * * *', 'select public.open_shops_at_opening()');
