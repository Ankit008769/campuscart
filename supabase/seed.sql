-- Local development seed, loaded by `supabase db reset` and by db-tests.
-- Drop points are the real NIT Hamirpur hostels. Shops, items and walk times are SAMPLE data until
-- the Phase 0 shop survey replaces them.

insert into public.fee_rules (key, value_paise) values
  ('delivery_fee', 1500),
  ('small_cart_limit', 9900),
  ('small_cart_fee', 1000),
  ('platform_fee', 400)
on conflict (key) do update set value_paise = excluded.value_paise;

insert into public.drop_points (name, kind, gate_only) values
  ('Kailash Hostel', 'hostel', false),
  ('Shivalik Hostel', 'hostel', false),
  ('Dhauladhar Hostel', 'hostel', false),
  ('Vindhyachal Hostel', 'hostel', false),
  ('Neelkanth Hostel', 'hostel', false),
  ('Himadri Hostel', 'hostel', false),
  ('Himgiri Hostel', 'hostel', false),
  ('Udaygiri Hostel', 'hostel', false),
  ('Parvati Hostel', 'hostel', true),
  ('Ambika Hostel', 'hostel', true),
  ('Aravali Hostel', 'hostel', true),
  ('Manimahesh Hostel', 'hostel', true),
  ('Satpura Hostel', 'hostel', true),
  ('Mega Hostel', 'hostel', false),
  ('Central Library', 'other', false),
  ('Student Activity Centre', 'other', false)
on conflict (name) do nothing;

insert into public.categories (name, sort) values
  ('Snacks', 1),
  ('Stationery', 2),
  ('Fruit and juice', 3),
  ('Medicines', 4),
  ('Essentials', 5),
  ('Printouts', 6)
on conflict (name) do nothing;

-- SAMPLE shops ------------------------------------------------------------------------------------

insert into public.shops (id, name, kind, is_open, prep_minutes, does_delivery, does_pickup) values
  ('00000000-0000-4000-8000-000000000001', 'Campus General Store', 'Groceries, snacks, essentials', true, 6, true, true),
  ('00000000-0000-4000-8000-000000000002', 'Stationery and Print Corner', 'Notebooks, lab files, printouts', true, 8, true, true),
  ('00000000-0000-4000-8000-000000000003', 'Juice Corner', 'Fresh juice, shakes, fruit', true, 10, true, true),
  ('00000000-0000-4000-8000-000000000004', 'Night Canteen', 'Maggi, parathas, chai', false, 12, true, false)
on conflict (id) do nothing;

insert into public.products (id, shop_id, category_id, name, is_veg)
select v.id::uuid, v.shop_id::uuid, c.id, v.name, v.is_veg
from (values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Snacks', 'Maggi Masala Noodles', true),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Snacks', 'Lays Classic Salted', true),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Snacks', 'Parle-G Biscuits', true),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'Essentials', 'Toned Milk', true),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', 'Essentials', 'Brown Bread', true),
  ('10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001', 'Essentials', 'Colgate Toothpaste', null),
  ('10000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000002', 'Stationery', 'Classmate Notebook', null),
  ('10000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000002', 'Stationery', 'Blue Ball Pens', null),
  ('10000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000002', 'Stationery', 'Lab File', null),
  ('10000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000002', 'Printouts', 'Printout', null),
  ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000003', 'Fruit and juice', 'Mango Shake', true),
  ('10000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000003', 'Fruit and juice', 'Fresh Orange Juice', true),
  ('10000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000003', 'Fruit and juice', 'Bananas', true),
  ('10000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000004', 'Snacks', 'Maggi Plate', true),
  ('10000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000004', 'Snacks', 'Aloo Paratha', true),
  ('10000000-0000-4000-8000-000000000016', '00000000-0000-4000-8000-000000000004', 'Snacks', 'Masala Chai', true)
) as v(id, shop_id, category, name, is_veg)
join public.categories c on c.name = v.category
on conflict (id) do nothing;

insert into public.variants (id, product_id, label, mrp_paise, price_paise, sort) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '70 g', 1400, 1400, 1),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Pack of 4', 5600, 5400, 2),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '50 g', 2000, 2000, 1),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', '250 g', 2500, 2500, 1),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000004', '500 ml', 2800, 2700, 1),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000005', '400 g', 5000, 4500, 1),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000006', '100 g', 5500, 5200, 1),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000007', '172 pages', 6500, 6000, 1),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000008', 'Pack of 5', 5000, 4500, 1),
  ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000009', 'A4', 3000, 3000, 1),
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000010', 'B/W, per page', 200, 200, 1),
  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000010', 'Colour, per page', 1000, 1000, 2),
  ('20000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000011', '300 ml', 6000, 6000, 1),
  ('20000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000012', '300 ml', 5000, 5000, 1),
  ('20000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000013', '1 dozen', 6000, 6000, 1),
  ('20000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000014', 'Plate', 4000, 4000, 1),
  ('20000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000015', '2 pieces', 3500, 3500, 1),
  ('20000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000016', 'Cup', 1500, 1500, 1)
on conflict (id) do nothing;

-- SAMPLE walk times: 10 minutes everywhere until the Phase 0 walk-around measures them.
insert into public.walk_times (shop_id, drop_point_id, minutes)
select s.id, d.id, 10
from public.shops s cross join public.drop_points d
on conflict (shop_id, drop_point_id) do nothing;
