-- Admin → Students: everyone who has signed in as a student, with their basic details and how much
-- they order. Admins only (the function refuses anyone else), newest first.

create or replace function public.admin_list_students()
returns table (
  id uuid,
  name text,
  email text,
  phone text,
  drop_point text,
  room_note text,
  joined_at timestamptz,
  terms_accepted_at timestamptz,
  blocked boolean,
  deletion_requested boolean,
  rider_status text,
  orders bigint,
  completed_orders bigint,
  last_order_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see the student list' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, p.email, p.phone, d.name, p.room_note, p.created_at, p.terms_accepted_at, p.blocked,
           p.deletion_requested_at is not null, r.status::text,
           count(o.id), count(o.id) filter (where o.status in ('delivered', 'collected')), max(o.placed_at)
    from public.profiles p
    left join public.drop_points d on d.id = p.default_drop_point_id
    left join public.riders r on r.profile_id = p.id
    left join public.orders o on o.student_id = p.id
    where p.role in ('student', 'rider')
    group by p.id, d.name, r.status
    order by p.created_at desc;
end;
$$;

revoke all on function public.admin_list_students() from public, anon;
grant execute on function public.admin_list_students() to authenticated;

-- Security tidy-up from the advisor: check_rider_cash is a trigger function, so nobody needs to call
-- it directly (triggers run it without this permission). Signed-out visitors could reach it at
-- /rest/v1/rpc/check_rider_cash, where it only errors; now they can't reach it at all.
revoke execute on function public.check_rider_cash() from public, anon, authenticated;
