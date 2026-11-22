-- Shops, menus, prices and stock update live everywhere, like orders already do: a shop switching
-- itself open or closed, or marking an item out of stock, shows at once in the student app, the
-- website and the shop's other phones, without a refresh.
--
-- watchCatalog (packages/core/src/api.ts) joins a private catalog:<random> channel and listens to
-- postgres_changes on shops, products and variants. Every signed-in person may join it: they can all
-- read shops and active products already, and each changed row still reaches them only through the
-- tables' read policies. The policy on realtime.messages (in the _platform migration) only calls this,
-- so db-tests can check the rule.

create or replace function public.can_watch_catalog_channel(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and coalesce(p_topic ~ '^catalog:[a-z0-9]+$', false);
$$;

revoke all on function public.can_watch_catalog_channel(text) from public, anon;
grant execute on function public.can_watch_catalog_channel(text) to authenticated;
