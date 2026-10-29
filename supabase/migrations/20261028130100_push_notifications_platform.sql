-- Supabase-only half of push notifications (skipped by db-tests): wakes the send-push Edge Function.
-- pg_net is asynchronous, so an order transaction never waits on the HTTP call. The project URL is
-- public; the function needs no credentials from the database because it reads the outbox with its
-- own service key.

create extension if not exists pg_net with schema extensions;

create or replace function public.ping_send_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://xccstwhfaawgbztcrghs.supabase.co/functions/v1/send-push',
    body := '{}'::jsonb
  );
  return null;
end;
$$;

revoke all on function public.ping_send_push() from public, anon, authenticated;

-- Once per statement: a new order with three staff members to alert costs one call, not three.
create trigger ping_send_push
  after insert on public.push_outbox
  for each statement execute function public.ping_send_push();

-- Backup for a missed ping, and a daily sweep of old messages.
select cron.schedule(
  'send-push-backup',
  '* * * * *',
  $$select net.http_post(url := 'https://xccstwhfaawgbztcrghs.supabase.co/functions/v1/send-push', body := '{}'::jsonb)
    where exists (select 1 from public.push_outbox where sent_at is null and created_at > now() - interval '15 minutes')$$
);
select cron.schedule(
  'prune-push-outbox',
  '30 3 * * *',
  $$delete from public.push_outbox where created_at < now() - interval '7 days'$$
);
