-- Supabase-only half of live tracking (skipped by db-tests): Realtime authorization for the private
-- track:<order id> broadcast channels. Also switch off "Allow public access" in the dashboard's
-- Realtime settings, so every channel must be private and these policies always apply.

create policy "only the rider sends tracking positions" on realtime.messages
  for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and public.can_use_tracking_channel((select realtime.topic()), true));

create policy "the student and rider follow tracking positions" on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.can_use_tracking_channel((select realtime.topic()), false));
