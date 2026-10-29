-- Supabase-only half of Print Store (skipped by db-tests): the private bucket, its policies and the
-- hourly clean-up. Students write only into their own folder; reading is for the shop the file was
-- ordered from (can_read_print_file, tested in db-tests), which gets short-lived signed links.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('print-files', 'print-files', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create policy "students upload print files to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'print-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "only the ordering shop reads a print file" on storage.objects
  for select to authenticated
  using (bucket_id = 'print-files' and public.can_read_print_file(name));

-- Files go through the Storage API to be deleted, so the purge-prints Edge Function does it.
select cron.schedule(
  'purge-print-files',
  '17 * * * *',
  $$select net.http_post(url := 'https://xccstwhfaawgbztcrghs.supabase.co/functions/v1/purge-prints', body := '{}'::jsonb)$$
);
