-- Supabase-only half of catalog editing (skipped by db-tests): shops upload their own item photos.
-- Photos live at shops/<shop id>/<file> in the public product-photos bucket. Staff write only under
-- their own shop's folder; admins anywhere. Reading stays public through the bucket's public URLs.

create policy "staff upload their shop's product photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-photos'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] = 'shops'
        and (storage.foldername(name))[2] in (select id::text from public.my_shop_ids() as id)
      )
    )
  );

create policy "staff remove their shop's product photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-photos'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] = 'shops'
        and (storage.foldername(name))[2] in (select id::text from public.my_shop_ids() as id)
      )
    )
  );
