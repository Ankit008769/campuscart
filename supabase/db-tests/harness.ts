/**
 * Runs the real migrations and seed against PGlite (Postgres compiled to WebAssembly), so the
 * schema, security rules and order engine can be tested without Docker or a Supabase project.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const supabaseDir = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The parts of a Supabase database the migrations rely on: roles, auth.users, auth.uid() and default grants. */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create role supabase_auth_admin nologin;

  create schema extensions;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  $$;

  grant usage on schema auth, extensions, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  select set_config('request.jwt.claims', '{}', false);
  set search_path = public, extensions;
`;

export const SHOP = {
  general: '00000000-0000-4000-8000-000000000001',
  stationery: '00000000-0000-4000-8000-000000000002',
  juice: '00000000-0000-4000-8000-000000000003',
  nightCanteen: '00000000-0000-4000-8000-000000000004',
} as const;

export const VARIANT = {
  maggi70g: '20000000-0000-4000-8000-000000000001',
  laysClassic: '20000000-0000-4000-8000-000000000003',
  milk: '20000000-0000-4000-8000-000000000005',
  notebook: '20000000-0000-4000-8000-000000000008',
  mangoShake: '20000000-0000-4000-8000-000000000013',
  maggiPlate: '20000000-0000-4000-8000-000000000016',
} as const;

export async function createDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pg_trgm } });
  await db.exec(SUPABASE_STUB);

  const migrationsDir = join(supabaseDir, 'migrations');
  const migrations = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql') && !file.endsWith('_platform.sql'))
    .sort();
  for (const file of migrations) {
    await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  await db.exec(readFileSync(join(supabaseDir, 'seed.sql'), 'utf8'));
  return db;
}

/** Runs SQL as the database owner, outside row-level security. */
export async function asOwner<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

/** Creates an auth user the way Supabase Auth would, which fires the profile trigger. */
export async function addUser(db: PGlite, email: string, name = 'Test User'): Promise<string> {
  const [user] = await asOwner<{ id: string }>(
    db,
    `insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
    [email, name],
  );
  return user.id;
}

/** Runs `fn` as a signed-in user (role authenticated), or signed out (role anon) when userId is null. */
export async function as<T>(db: PGlite, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify(userId ? { sub: userId, role: 'authenticated' } : {}),
  ]);
  await db.exec(userId ? 'set role authenticated' : 'set role anon');
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claims', '{}', false);`);
  }
}

export type OrderRow = {
  id: string;
  status: string;
  token_no: number;
  subtotal_paise: number;
  delivery_fee_paise: number;
  small_cart_fee_paise: number;
  platform_fee_paise: number;
  total_paise: number;
  cancel_reason: string | null;
  prep_minutes: number | null;
};

export async function placeOrder(
  db: PGlite,
  args: {
    shopId: string;
    mode: 'delivery' | 'pickup';
    items: { variant_id: string; qty: number }[];
    dropPointId?: string | null;
    roomNote?: string | null;
  },
): Promise<OrderRow> {
  const result = await db.query<OrderRow>(
    `select * from public.place_order($1, $2::public.order_mode, 'cash'::public.pay_method, $3::jsonb, $4, $5)`,
    [args.shopId, args.mode, JSON.stringify(args.items), args.dropPointId ?? null, args.roomNote ?? null],
  );
  return result.rows[0];
}

export async function transition(
  db: PGlite,
  orderId: string,
  to: string,
  extra: { note?: string; code?: string; prepMinutes?: number } = {},
): Promise<OrderRow> {
  const result = await db.query<OrderRow>(
    `select * from public.transition_order($1, $2::public.order_status, $3, $4, $5)`,
    [orderId, to, extra.note ?? null, extra.code ?? null, extra.prepMinutes ?? null],
  );
  return result.rows[0];
}

export async function dropPointId(db: PGlite, name: string): Promise<string> {
  const [row] = await asOwner<{ id: string }>(db, 'select id from public.drop_points where name = $1', [name]);
  return row.id;
}
