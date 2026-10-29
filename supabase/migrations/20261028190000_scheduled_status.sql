-- Scheduled orders (build session 2.10) get their own status before placed. Postgres won't use a
-- new enum value in the transaction that adds it, so this stays alone in its own migration.
alter type public.order_status add value if not exists 'scheduled' before 'placed';
