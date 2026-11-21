-- Google Play's reviewers, and anyone demoing the app, have no @nith.ac.in account. Admins may now
-- approve a named Gmail as a student (role 'student', no shop) in allowed_logins:
--
--   insert into public.allowed_logins (email, role, note)
--   values (lower('campuscart.review@gmail.com'), 'student', 'Google Play review account');
--
-- The sign-up hook already lets approved emails in, and handle_new_user gives the account the approved
-- role. College accounts still sign up with no approval, and allowed_logins_check still keeps shop
-- roles (and only shop roles) tied to a shop.
alter table public.allowed_logins drop constraint allowed_logins_role_check;
