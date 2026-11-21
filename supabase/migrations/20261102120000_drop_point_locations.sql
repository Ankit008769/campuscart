-- Map positions for the drop points, so live tracking shows where an order is going. From
-- OpenStreetMap (© OpenStreetMap contributors, ODbL), looked up by name inside the NIT Hamirpur
-- campus on 2 November 2026. Kailash Hostel and the Mega Hostel aren't named on OpenStreetMap, so
-- admins set those on the Drop points page. Only empty positions are filled, so nothing an admin
-- already set is overwritten. Parvati and Ambika share one building on the map.

update public.drop_points d set lat = v.lat, lng = v.lng
from (values
  ('Shivalik Hostel', 31.71225, 76.52651),
  ('Dhauladhar Hostel', 31.71107, 76.52464),
  ('Vindhyachal Hostel', 31.70670, 76.53392),
  ('Neelkanth Hostel', 31.71042, 76.52355),
  ('Himadri Hostel', 31.70908, 76.52355),
  ('Himgiri Hostel', 31.70839, 76.52342),
  ('Udaygiri Hostel', 31.70770, 76.52357),
  ('Parvati Hostel', 31.70395, 76.52567),
  ('Ambika Hostel', 31.70395, 76.52567),
  ('Aravali Hostel', 31.71311, 76.52562),
  ('Manimahesh Hostel', 31.71235, 76.52579),
  ('Satpura Hostel', 31.71350, 76.52547),
  ('Central Library', 31.70722, 76.52691),
  ('Student Activity Centre', 31.70813, 76.52523)
) as v(name, lat, lng)
where d.name = v.name and d.lat is null and d.lng is null;
