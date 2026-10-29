-- CampusCart core schema (build session 1.1).
-- Money is integer paise everywhere. Apps never write orders directly: see the order engine migration.

create extension if not exists pg_trgm with schema extensions;

create type public.user_role as enum ('student', 'merchant_owner', 'merchant_staff', 'rider', 'admin');
create type public.staff_role as enum ('owner', 'counter');
create type public.drop_point_kind as enum ('hostel', 'department', 'other');
create type public.order_mode as enum ('delivery', 'pickup');
create type public.pay_method as enum ('cash', 'upi_at_handover');
create type public.order_status as enum (
  'placed', 'accepted', 'ready', 'out_for_delivery', 'delivered', 'collected', 'rejected', 'cancelled', 'expired'
);

-- campus ------------------------------------------------------------------------------------------

create table public.drop_points (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind public.drop_point_kind not null,
  -- Deliveries stop at reception (for example girls' hostels) instead of going to the room.
  gate_only boolean not null default false,
  lat double precision,
  lng double precision,
  active boolean not null default true
);

create table public.fee_rules (
  key text primary key check (key in ('delivery_fee', 'small_cart_limit', 'small_cart_fee', 'platform_fee')),
  value_paise integer not null check (value_paise >= 0)
);

-- shops and people --------------------------------------------------------------------------------

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default '',
  phone text,
  is_open boolean not null default false,
  hours jsonb not null default '{}'::jsonb,
  commission_bps integer not null default 0 check (commission_bps between 0 and 10000),
  prep_minutes integer not null default 10 check (prep_minutes between 1 and 120),
  does_delivery boolean not null default true,
  does_pickup boolean not null default true,
  fssai_no text,
  gstin text,
  upi_vpa text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'student',
  name text not null default '',
  email text,
  phone text,
  default_drop_point_id uuid references public.drop_points (id) on delete set null,
  room_note text,
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.shop_staff (
  shop_id uuid not null references public.shops (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.staff_role not null default 'counter',
  primary key (shop_id, profile_id)
);

-- Non-college emails an admin approved before their first sign-in (shop owners, staff, admins).
create table public.allowed_logins (
  email text primary key check (email = lower(email)),
  role public.user_role not null check (role <> 'student'),
  shop_id uuid references public.shops (id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  check ((role in ('merchant_owner', 'merchant_staff')) = (shop_id is not null))
);

create table public.walk_times (
  shop_id uuid not null references public.shops (id) on delete cascade,
  drop_point_id uuid not null references public.drop_points (id) on delete cascade,
  minutes integer not null check (minutes between 0 and 120),
  primary key (shop_id, drop_point_id)
);

-- catalog -----------------------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text,
  sort integer not null default 0
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  name text not null,
  description text not null default '',
  image_path text,
  is_veg boolean,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index products_shop_idx on public.products (shop_id);
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);

create table public.variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  label text not null default '',
  mrp_paise integer not null check (mrp_paise > 0),
  -- Selling above MRP is illegal in India.
  price_paise integer not null check (price_paise > 0 and price_paise <= mrp_paise),
  in_stock boolean not null default true,
  sort integer not null default 0
);

create index variants_product_idx on public.variants (product_id);

-- orders ------------------------------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  student_id uuid not null references public.profiles (id),
  shop_id uuid not null references public.shops (id),
  mode public.order_mode not null,
  drop_point_id uuid references public.drop_points (id),
  room_note text,
  status public.order_status not null default 'placed',
  pay_method public.pay_method not null,
  subtotal_paise integer not null check (subtotal_paise > 0),
  delivery_fee_paise integer not null default 0,
  small_cart_fee_paise integer not null default 0,
  platform_fee_paise integer not null default 0,
  total_paise integer not null,
  prep_minutes integer,
  token_no integer not null,
  cancel_reason text,
  placed_at timestamptz not null default now(),
  accepted_at timestamptz,
  ready_at timestamptz,
  out_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  check (total_paise = subtotal_paise + delivery_fee_paise + small_cart_fee_paise + platform_fee_paise),
  check ((mode = 'delivery') = (drop_point_id is not null))
);

create index orders_shop_status_idx on public.orders (shop_id, status);
create index orders_student_idx on public.orders (student_id, placed_at desc);
create index orders_waiting_idx on public.orders (placed_at) where status = 'placed';

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid references public.variants (id) on delete set null,
  name_snapshot text not null,
  price_paise_snapshot integer not null check (price_paise_snapshot > 0),
  qty integer not null check (qty between 1 and 50)
);

create index order_items_order_idx on public.order_items (order_id);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor text not null check (actor in ('student', 'shop', 'rider', 'admin', 'system')),
  actor_id uuid references public.profiles (id) on delete set null,
  note text,
  at timestamptz not null default now()
);

create index order_events_order_idx on public.order_events (order_id, at);

-- Kept apart from orders so that only the student who placed the order can read the code.
create table public.order_secrets (
  order_id uuid primary key references public.orders (id) on delete cascade,
  delivery_otp text not null check (delivery_otp ~ '^[0-9]{4}$')
);

-- Pickup tokens restart at 1 for each shop every day (India time).
create table public.shop_daily_counters (
  shop_id uuid not null references public.shops (id) on delete cascade,
  day date not null,
  last_token integer not null default 0,
  primary key (shop_id, day)
);

create table public.device_tokens (
  user_id uuid not null references public.profiles (id) on delete cascade,
  app text not null check (app in ('consumer', 'merchant')),
  expo_token text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, app, expo_token)
);
