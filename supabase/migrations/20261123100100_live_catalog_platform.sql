-- Supabase-only half of live shops and menus (skipped by db-tests): publish their changes to
-- Realtime, and let signed-in people join the private catalog:<random> channels watchCatalog opens.
-- Nobody gets an insert policy, so nobody can broadcast on them.

alter publication supabase_realtime add table public.shops, public.products, public.variants;

create policy "signed-in people follow shop and menu changes" on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.can_watch_catalog_channel((select realtime.topic())));
