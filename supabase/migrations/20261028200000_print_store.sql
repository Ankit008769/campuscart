-- Print Store (build session 2.8).
--
-- A student uploads a PDF to the private print-files bucket at <their id>/<job id>.pdf and adds a
-- print_jobs row. The price-print Edge Function counts the pages and calls set_print_pages, the
-- only way a job gets a page count and price. place_print_order then turns the priced job into an
-- ordinary order for the shop. Only that shop's staff can download the file once it is ordered
-- (can_read_print_file, used by the storage policy), and purge-prints deletes files 24 hours after
-- the order ends, or a day after upload when the job was never ordered.

create table public.print_settings (
  shop_id uuid primary key references public.shops (id) on delete cascade,
  bw_page_paise integer not null check (bw_page_paise > 0),
  color_page_paise integer not null check (color_page_paise > 0),
  max_pages integer not null default 200 check (max_pages between 1 and 1000),
  active boolean not null default true
);

create table public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  shop_id uuid not null references public.shops (id),
  file_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 120),
  copies integer not null default 1 check (copies between 1 and 20),
  color boolean not null default false,
  double_sided boolean not null default false,
  pages integer check (pages > 0),
  price_paise integer check (price_paise > 0),
  order_id uuid unique references public.orders (id) on delete set null,
  created_at timestamptz not null default now(),
  file_deleted_at timestamptz,
  check ((pages is null) = (price_paise is null)),
  -- The file sits in the student's own folder, named after the job.
  check (file_path = student_id::text || '/' || id::text || '.pdf')
);
create index print_jobs_shop_idx on public.print_jobs (shop_id) where order_id is not null;

alter table public.print_settings enable row level security;
alter table public.print_jobs enable row level security;

create policy "everyone reads print settings" on public.print_settings
  for select to authenticated using (true);
create policy "admins manage print settings" on public.print_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "shops set their own print rates" on public.print_settings
  for update to authenticated
  using (shop_id in (select public.my_shop_ids())) with check (shop_id in (select public.my_shop_ids()));

create policy "students add their own print jobs" on public.print_jobs
  for insert to authenticated
  with check (student_id = (select auth.uid()) and pages is null and price_paise is null and order_id is null);
create policy "students read their own print jobs" on public.print_jobs
  for select to authenticated using (student_id = (select auth.uid()));
create policy "students drop print jobs they haven't ordered" on public.print_jobs
  for delete to authenticated using (student_id = (select auth.uid()) and order_id is null);
create policy "shops read jobs ordered from them" on public.print_jobs
  for select to authenticated using (order_id is not null and shop_id in (select public.my_shop_ids()));
create policy "admins read print jobs" on public.print_jobs
  for select to authenticated using (public.is_admin());

grant select on public.print_settings, public.print_jobs to authenticated;
grant insert, update, delete on public.print_settings to authenticated;
grant insert, delete on public.print_jobs to authenticated;

-- Whether the signed-in person may download a print file: staff of the shop it was ordered from,
-- while the file still exists. Nobody else, not even the student who uploaded it.
create or replace function public.can_read_print_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.print_jobs j
    where j.file_path = p_name
      and j.order_id is not null
      and j.file_deleted_at is null
      and j.shop_id in (select public.my_shop_ids())
  );
$$;

-- For price-print (service role only): records the page count and prices the job from the shop's
-- rates. Pages times copies times the black-and-white or colour rate.
create or replace function public.set_print_pages(p_job_id uuid, p_pages integer)
returns public.print_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.print_jobs;
  v_rates public.print_settings;
begin
  select * into v_job from public.print_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Print job not found' using errcode = 'P0002';
  end if;
  if v_job.order_id is not null then
    raise exception 'This print job is already ordered' using errcode = 'P0001';
  end if;
  select * into v_rates from public.print_settings where shop_id = v_job.shop_id and active;
  if not found then
    raise exception 'This shop does not take print orders' using errcode = 'P0001';
  end if;
  if p_pages is null or p_pages < 1 then
    raise exception 'The file has no pages to print' using errcode = '22023';
  end if;
  if p_pages > v_rates.max_pages then
    raise exception 'This shop prints up to % pages per file', v_rates.max_pages using errcode = 'P0001';
  end if;
  update public.print_jobs set
    pages = p_pages,
    price_paise = p_pages * copies * case when color then v_rates.color_page_paise else v_rates.bw_page_paise end
  where id = p_job_id
  returning * into v_job;
  return v_job;
end;
$$;

-- Turns the student's priced print job into an order: one item, priced by set_print_pages, with
-- the usual fees, token, delivery code and events.
create or replace function public.place_print_order(
  p_job_id uuid,
  p_mode public.order_mode,
  p_pay_method public.pay_method,
  p_drop_point_id uuid default null,
  p_room_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_profile public.profiles;
  v_job public.print_jobs;
  v_shop public.shops;
  v_bill record;
  v_token integer;
  v_order public.orders;
begin
  select * into v_profile from public.profiles where id = v_user;
  if not found or v_profile.blocked then
    raise exception 'This account cannot place orders' using errcode = '42501';
  end if;
  select * into v_job from public.print_jobs where id = p_job_id and student_id = v_user for update;
  if not found then
    raise exception 'Print job not found' using errcode = 'P0002';
  end if;
  if v_job.order_id is not null then
    raise exception 'This print job is already ordered' using errcode = 'P0001';
  end if;
  if v_job.price_paise is null then
    raise exception 'The file is still being checked. Try again in a moment.' using errcode = 'P0001';
  end if;
  if v_job.file_deleted_at is not null or v_job.created_at < now() - interval '1 day' then
    raise exception 'This file has expired. Upload it again.' using errcode = 'P0001';
  end if;

  select * into v_shop from public.shops where id = v_job.shop_id;
  if not v_shop.is_open then
    raise exception 'This shop is closed right now' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.print_settings where shop_id = v_shop.id and active) then
    raise exception 'This shop does not take print orders' using errcode = 'P0001';
  end if;
  if p_mode = 'delivery' and not v_shop.does_delivery then
    raise exception 'This shop does not deliver' using errcode = 'P0001';
  end if;
  if p_mode = 'pickup' and not v_shop.does_pickup then
    raise exception 'This shop does not offer pickup' using errcode = 'P0001';
  end if;
  if p_mode = 'delivery' then
    if not exists (select 1 from public.drop_points where id = p_drop_point_id and active) then
      raise exception 'Choose where to deliver' using errcode = 'P0001';
    end if;
  else
    p_drop_point_id := null;
  end if;

  select * into v_bill from public.calculate_bill(v_job.price_paise, p_mode);

  insert into public.shop_daily_counters as c (shop_id, day, last_token)
  values (v_shop.id, (now() at time zone 'Asia/Kolkata')::date, 1)
  on conflict (shop_id, day) do update set last_token = c.last_token + 1
  returning c.last_token into v_token;

  insert into public.orders (
    code, student_id, shop_id, mode, drop_point_id, room_note, pay_method,
    subtotal_paise, delivery_fee_paise, small_cart_fee_paise, platform_fee_paise, total_paise, token_no
  )
  values (
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    v_user, v_shop.id, p_mode, p_drop_point_id,
    case when p_mode = 'delivery' then coalesce(nullif(trim(p_room_note), ''), v_profile.room_note) end,
    p_pay_method,
    v_bill.subtotal_paise, v_bill.delivery_fee_paise, v_bill.small_cart_fee_paise,
    v_bill.platform_fee_paise, v_bill.total_paise, v_token
  )
  returning * into v_order;

  insert into public.order_items (order_id, variant_id, name_snapshot, price_paise_snapshot, qty)
  values (
    v_order.id, null,
    left('Printout: ' || v_job.file_name, 80) || ' (' || v_job.pages || ' pages'
      || case when v_job.copies > 1 then ' × ' || v_job.copies || ' copies' else '' end
      || ', ' || case when v_job.color then 'colour' else 'black and white' end
      || case when v_job.double_sided then ', both sides' else '' end || ')',
    v_job.price_paise, 1
  );
  update public.print_jobs set order_id = v_order.id where id = v_job.id;

  insert into public.order_secrets (order_id, delivery_otp)
  values (v_order.id, lpad(floor(random() * 10000)::integer::text, 4, '0'));
  insert into public.order_events (order_id, from_status, to_status, actor, actor_id)
  values (v_order.id, null, 'placed', 'student', v_user);
  return v_order;
end;
$$;

-- For purge-prints (service role only): files to delete. An ordered file goes 24 hours after its
-- order ends; a file never ordered goes a day after upload.
create or replace function public.expired_print_files()
returns table (job_id uuid, file_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select j.id, j.file_path
  from public.print_jobs j
  left join public.orders o on o.id = j.order_id
  where j.file_deleted_at is null
    and (
      (o.id is null and j.created_at < now() - interval '1 day')
      or (o.status in ('delivered', 'collected') and o.completed_at < now() - interval '1 day')
      or (o.status in ('rejected', 'cancelled', 'expired') and o.cancelled_at < now() - interval '1 day')
    )
  limit 500;
$$;

create or replace function public.mark_print_files_deleted(p_job_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.print_jobs set file_deleted_at = now() where id = any (p_job_ids);
$$;

revoke all on function public.can_read_print_file(text) from public, anon;
revoke all on function public.set_print_pages(uuid, integer) from public, anon, authenticated;
revoke all on function public.place_print_order(uuid, public.order_mode, public.pay_method, uuid, text) from public, anon;
revoke all on function public.expired_print_files() from public, anon, authenticated;
revoke all on function public.mark_print_files_deleted(uuid[]) from public, anon, authenticated;
grant execute on function public.can_read_print_file(text) to authenticated;
grant execute on function public.place_print_order(uuid, public.order_mode, public.pay_method, uuid, text) to authenticated;
grant execute on function public.set_print_pages(uuid, integer) to service_role;
grant execute on function public.expired_print_files() to service_role;
grant execute on function public.mark_print_files_deleted(uuid[]) to service_role;
