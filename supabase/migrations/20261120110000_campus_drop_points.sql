-- Every useful place on the NIT Hamirpur campus as a drop point, with its map position, from
-- OpenStreetMap (© OpenStreetMap contributors, ODbL), looked up on 20 November 2026. Students find
-- them in the app's searchable picker, so names carry the short forms people search for (CSE, OAT).
-- Existing drop points (the hostels) are left alone. Kailash Hostel and the Mega Hostel are still not
-- on the map; admins pin those on the Drop points page.

insert into public.drop_points (name, kind, gate_only, lat, lng) values
  ('Architecture Department', 'department', false, 31.70902, 76.52636),
  ('Chemical Engineering Department', 'department', false, 31.70810, 76.52595),
  ('Civil Engineering Department', 'department', false, 31.70911, 76.52734),
  ('Computer Science and Engineering (CSE) Department', 'department', false, 31.70839, 76.52690),
  ('Electrical Engineering (EE) Department', 'department', false, 31.70797, 76.52726),
  ('Electronics and Communication (ECE) Department', 'department', false, 31.70811, 76.52656),
  ('Mechanical Engineering Department', 'department', false, 31.70878, 76.52671),
  ('Materials Science and Engineering Centre', 'department', false, 31.70802, 76.52642),
  ('Physics Department', 'department', false, 31.70658, 76.53429),
  ('Applied Sciences and Humanities (Maths, Chemistry, HSS)', 'department', false, 31.70687, 76.53420),
  ('Vivekananda Lecture Hall Complex (LHC)', 'department', false, 31.70742, 76.52631),
  ('Computer Centre', 'department', false, 31.70872, 76.52706),
  ('Central Workshop', 'department', false, 31.70980, 76.52686),
  ('Administrative Block', 'other', false, 31.70811, 76.52806),
  ('Central Block', 'other', false, 31.70760, 76.52783),
  ('Auditorium', 'other', false, 31.70684, 76.52736),
  ('Open Air Theatre (OAT)', 'other', false, 31.70548, 76.52514),
  ('Sports Complex', 'other', false, 31.70587, 76.52524),
  ('NIT Ground', 'other', false, 31.70605, 76.52471),
  ('Lawn Tennis Court', 'other', false, 31.70599, 76.52397),
  ('Student Activity Park', 'other', false, 31.70704, 76.52846),
  ('Dispensary', 'other', false, 31.70613, 76.52766),
  ('Main Guest House', 'other', false, 31.70602, 76.52619),
  ('Faculty Residential Area', 'other', false, 31.70324, 76.52399),
  ('Gate 1', 'other', false, 31.70176, 76.52281),
  ('Gate 2', 'other', false, 31.71192, 76.52465),
  ('Gate 3', 'other', false, 31.71004, 76.52308)
on conflict (name) do nothing;

-- Placeholder walk times, as for the hostels, until shops tell us better: 10 minutes from every shop.
insert into public.walk_times (shop_id, drop_point_id, minutes)
select s.id, d.id, 10 from public.shops s cross join public.drop_points d
on conflict (shop_id, drop_point_id) do nothing;
