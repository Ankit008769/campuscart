-- Supabase-only: needs the storage schema, so db-tests skip it.
-- Public bucket for product photos: anyone with the URL can view them (they aren't private), and only
-- the service role (CLI uploads) can write until shop catalog editing arrives in build session 1.9.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
