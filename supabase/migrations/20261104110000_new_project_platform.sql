-- CampusCart moved to its own Supabase project (ref pclighjvsijnedapngwg), so the database must wake
-- this project's Edge Functions, not the old project's. The migrations this replaces still name the
-- old address. cron.schedule with an existing job name updates that job.

create or replace function public.ping_send_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://pclighjvsijnedapngwg.supabase.co/functions/v1/send-push',
    body := '{}'::jsonb
  );
  return null;
end;
$$;

select cron.schedule(
  'send-push-backup',
  '* * * * *',
  $$select net.http_post(url := 'https://pclighjvsijnedapngwg.supabase.co/functions/v1/send-push', body := '{}'::jsonb)
    where exists (select 1 from public.push_outbox where sent_at is null and created_at > now() - interval '15 minutes')$$
);

select cron.schedule(
  'purge-print-files',
  '17 * * * *',
  $$select net.http_post(url := 'https://pclighjvsijnedapngwg.supabase.co/functions/v1/purge-prints', body := '{}'::jsonb)$$
);
