-- Push notifications for order updates (build session 1.10).
--
-- Every status change queues the messages it needs in push_outbox. The send-push Edge Function
-- reads the outbox with its own service key, sends through Expo's push service and drops dead
-- tokens. The database holds no secret: calling the function only makes it deliver sooner.

-- One push token, one owner: a phone that signs into another account moves its token across.
create unique index device_tokens_expo_token_key on public.device_tokens (expo_token);

create or replace function public.register_device_token(p_app text, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_app is null or p_app not in ('consumer', 'merchant') then
    raise exception 'Unknown app %', p_app using errcode = '22023';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[^]\s]{8,200}\]$' then
    raise exception 'Not an Expo push token' using errcode = '22023';
  end if;
  insert into public.device_tokens (user_id, app, expo_token)
  values ((select auth.uid()), p_app, p_token)
  on conflict (expo_token) do update
    set user_id = excluded.user_id, app = excluded.app, updated_at = now();
end;
$$;

create table public.push_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  app text not null check (app in ('consumer', 'merchant')),
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index push_outbox_pending_idx on public.push_outbox (id) where sent_at is null;

-- No policies and no grants for app users: only the trigger below and send-push touch the outbox.
alter table public.push_outbox enable row level security;

-- "₹125" or "₹12.50", for notification text.
create or replace function public.rupees_text(p_paise integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select '₹' || (p_paise / 100)::text
    || case when p_paise % 100 = 0 then '' else '.' || lpad((p_paise % 100)::text, 2, '0') end;
$$;

-- Turns one order event into the pushes it deserves. Delivered and collected send nothing:
-- the student is standing right there. A notification problem must never block an order, so
-- errors here are logged and swallowed.
create or replace function public.queue_order_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  v_shop text;
  v_place text;
  v_items integer;
  v_title text;
  v_body text;
begin
  select * into o from public.orders where id = new.order_id;
  select name into v_shop from public.shops where id = o.shop_id;
  select name into v_place from public.drop_points where id = o.drop_point_id;

  -- Messages for the shop's staff.
  if new.to_status = 'placed' or (new.to_status = 'cancelled' and new.actor = 'student') then
    if new.to_status = 'placed' then
      select coalesce(sum(qty), 0)::integer into v_items from public.order_items where order_id = o.id;
      v_title := 'New order #' || o.code;
      v_body := v_items || case when v_items = 1 then ' item' else ' items' end
        || ' · ' || public.rupees_text(o.total_paise)
        || ' · ' || case when o.mode = 'delivery' then 'Deliver to ' || v_place else 'Pickup, token #' || o.token_no end;
    else
      v_title := 'Order #' || o.code || ' was cancelled';
      v_body := 'The student cancelled it before you accepted.';
    end if;
    insert into public.push_outbox (user_id, app, title, body, data)
    select s.profile_id, 'merchant', v_title, v_body, jsonb_build_object('orderId', o.id)
    from public.shop_staff s
    where s.shop_id = o.shop_id;
    return new;
  end if;

  -- Messages for the student.
  case new.to_status
    when 'accepted' then
      v_title := v_shop || ' accepted your order';
      v_body := 'Ready in about ' || o.prep_minutes || ' min.';
    when 'ready' then
      if o.mode = 'pickup' then
        v_title := 'Ready for pickup';
        v_body := 'Show token #' || o.token_no || ' at ' || v_shop || '.';
      else
        v_title := 'Your order is packed';
        v_body := v_shop || ' will send it out shortly.';
      end if;
    when 'out_for_delivery' then
      v_title := 'On the way';
      v_body := 'Your order from ' || v_shop || ' is heading to ' || v_place || '. Keep your delivery code ready.';
    when 'rejected' then
      v_title := v_shop || ' could not take your order';
      v_body := coalesce(o.cancel_reason || '. ', '') || 'Nothing to pay.';
    when 'cancelled' then
      v_title := 'Your order was cancelled';
      v_body := coalesce(o.cancel_reason || '. ', '') || 'Nothing to pay.';
    when 'expired' then
      v_title := 'Order not accepted in time';
      v_body := v_shop || ' did not respond, so the order was dropped. Nothing to pay.';
    else
      return new;
  end case;

  insert into public.push_outbox (user_id, app, title, body, data)
  values (o.student_id, 'consumer', v_title, v_body, jsonb_build_object('orderId', o.id));
  return new;
exception when others then
  raise warning 'queue_order_push skipped order %: %', new.order_id, sqlerrm;
  return new;
end;
$$;

create trigger queue_order_push
  after insert on public.order_events
  for each row execute function public.queue_order_push();

-- For send-push: takes up to p_limit fresh messages, marks them sent (at most once, so overlapping
-- calls never double-send) and returns one row per device. Messages older than 15 minutes are
-- skipped as stale.
create or replace function public.claim_push_batch(p_limit integer default 100)
returns table (outbox_id bigint, app text, expo_token text, title text, body text, data jsonb)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.push_outbox o
    set sent_at = now()
    where o.id in (
      select p.id from public.push_outbox p
      where p.sent_at is null and p.created_at > now() - interval '15 minutes'
      order by p.id
      limit p_limit
      for update skip locked
    )
    returning o.id, o.user_id, o.app, o.title, o.body, o.data
  )
  select c.id, c.app, t.expo_token, c.title, c.body, c.data
  from claimed c
  join public.device_tokens t on t.user_id = c.user_id and t.app = c.app
  order by c.id;
$$;

-- For send-push: forgets tokens Expo reports as no longer registered (app uninstalled).
create or replace function public.forget_device_tokens(p_tokens text[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.device_tokens where expo_token = any (p_tokens);
$$;

revoke all on function public.register_device_token(text, text) from public, anon;
revoke all on function public.rupees_text(integer) from public, anon, authenticated;
revoke all on function public.queue_order_push() from public, anon, authenticated;
revoke all on function public.claim_push_batch(integer) from public, anon, authenticated;
revoke all on function public.forget_device_tokens(text[]) from public, anon, authenticated;
grant execute on function public.register_device_token(text, text) to authenticated;
grant execute on function public.claim_push_batch(integer) to service_role;
grant execute on function public.forget_device_tokens(text[]) to service_role;
