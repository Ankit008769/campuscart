-- Product photos and availability notes for the imported shop menus.
-- Most photos are Creative Commons and need attribution, so every photo keeps its credit and source.

alter table public.products
  add column photo_credit text,
  add column photo_source_url text,
  -- Free text from the shop's menu, such as "Sunday only" or "Monday to Friday; 8:30 AM to 10:30 AM".
  add column availability_note text;
