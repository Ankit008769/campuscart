# CampusCart

Blinkit-style ordering for the shops inside NIT Hamirpur: a student app, a shop (merchant) app and a web admin panel on one Supabase backend. The roadmap and the numbered build sessions (0.1, 1.2, …) live in the team's doc "CampusCart Roadmap — NIT Hamirpur", tab "Phase-by-phase build plan". Name branches after the session, e.g. `p1-s02-order-engine`.

## Layout

| Path | What it is |
| --- | --- |
| `apps/consumer` | Student app (Expo, expo-router), Android package `com.campuscart.student` |
| `apps/merchant` | Shop app (Expo, expo-router), Android package `com.campuscart.merchant` |
| `apps/admin` | Web admin panel (Next.js) |
| `packages/core` | Shared business rules (order state machine, bill preview, money, shop hours, CSV menu parsing) and the typed Supabase calls every app uses (`api.ts`, `catalog.ts`; admin-only calls in `admin.ts`) |
| `packages/ui` | Shared React Native pieces: brand tokens, `StatusBadge` |
| `supabase/` | Supabase project: `migrations/`, Edge Functions in `functions/` (`send-push`, `price-print`, `purge-prints`, shared keys in `_shared/`), `seed.sql`, `config.toml`, and `db-tests/` that run the migrations in PGlite |

## Commands (from the repo root)

```bash
npm install          # one install for every workspace
npm run consumer     # Expo dev server for the student app
npm run merchant     # Expo dev server for the shop app
npm run admin        # Next.js dev server for the admin panel
npm run typecheck    # every workspace
npm run lint
npm test             # packages/core unit tests + supabase/db-tests (node:test, no Docker needed)
npm run db:push      # apply new migrations to the linked Supabase project (Mumbai, ref xccstwhfaawgbztcrghs)
npm run db:types     # regenerate packages/core/src/database.types.ts from the linked project
```

Run `npm run db:types` after every schema change and commit the result; `packages/core/src/api.ts` fails to type-check if the database's order statuses or modes drift from `packages/core`. Apps read `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_KEY` (admin: `NEXT_PUBLIC_…`) from git-ignored `.env` files (see each app's `.env.example`); EAS builds get the same values from EAS environment variables.

## Rules

- TypeScript strict everywhere.
- Money is integer paise. Display it with `formatPaise`; never use floats for money.
- Order statuses run `scheduled` (waiting for its slot) → `placed` → … . Order status changes go through the database function `transition_order`. `can_transition` in SQL and `canTransition` in `packages/core/src/orders.ts` must agree; `supabase/db-tests/order-engine.test.ts` checks every combination. Change both together.
- `calculateBill` is a cart preview only. The database function `place_order` re-prices every order, and `calculate_bill` in SQL must match `calculateBill` (also checked by db-tests).
- Database changes go in a new timestamped file in `supabase/migrations/`; never edit a migration that has run on a shared database. Add or extend a test in `supabase/db-tests/` with every change.
- Deny by default: `anon` gets nothing, `authenticated` gets explicit grants, and every table has row-level security. Apps never insert or update orders directly.
- Migrations ending in `_platform.sql` hold Supabase-only setup (pg_cron, Realtime) and are skipped by db-tests, so check them with `supabase db reset` against a real Supabase.
- No secret keys in app code or committed files. Public values use `EXPO_PUBLIC_*` env vars; service keys live only in Edge Functions.
- Add packages to an Expo app with `npx expo install <package>` inside that app's folder, so versions match the SDK.
- Expo SDK 58 and Next.js 16 are newer than most training data. Read `apps/consumer/AGENTS.md` (Expo) or `apps/admin/AGENTS.md` (Next.js) and the docs they point to before using their APIs.
- Never edit `android/` or `ios/`: Expo generates them. Configure native behaviour in `app.json` and config plugins.
- Keep exactly one React and one React Native version in the repo (pinned by `overrides` in the root `package.json`). Check with `npm ls react-native`.
- Shops, menus and photos are live data: two real shops imported by `supabase/migrations/20261028100200_campus_menus.sql`, photos in the public `product-photos` storage bucket. Every stock photo keeps its `photo_credit` and `photo_source_url`; most are CC BY/BY-SA, so the credits must stay visible wherever photos show (`PhotoCredits`). Shops upload their own photos from the shop app to `shops/<shop id>/` in the bucket; `save_product` clears the stock credit when the photo changes. Only a shop sets `is_veg` (in its item editor); imports and scripts leave it null.
- Shop catalogs change through `save_product` (an item and all its sizes in one transaction, run as the caller so row-level security applies) and `set_category_in_stock`. Price may never exceed MRP; the database refuses it with a message that names the size.
- No placeholder data is left in the apps: shops, categories and search all come from Supabase. `supabase/seed.sql` still has four sample shops for local `db reset` and db-tests only.
- Push notifications: each order event queues messages in `push_outbox` (trigger `queue_order_push`); `supabase/functions/send-push` sends them through Expo's push service, one request per app because the two apps are separate Expo projects. Never put the delivery code in a notification. Deploy the function with `npx supabase functions deploy send-push` from `supabase/` after changing it. Android delivery also needs Firebase (FCM) credentials uploaded to each EAS project and `google-services.json` wired into each `app.json`.
- The admin panel signs in with Google in the browser and returns to its own origin, so every address it is served from must be in the Supabase redirect URLs (`config.toml` → `additional_redirect_urls`; `http://localhost:3000` is the site URL). Admins are accounts approved in `allowed_logins` with role `admin`. Admin pages are client components behind `AdminGate`; each `page.tsx` is a thin server file that sets `instant = false` and renders the page from a sibling file.
- Shop hours live in `shops.hours` as `{"opens","closes","closed_days"}` in Indian time (`packages/core/src/hours.ts`; `within_shop_hours` in SQL). The cron job `close_shops_after_hours` only ever closes a shop that is still marked open after hours; it never opens one.
- `app_events` feeds the admin funnel report and holds only who, which step, which shop and when. Keep it that way: no search text, device data or location. The student app logs each step once per run through `logStep`.
- `packages/core` unit tests run with `node --import ./test/resolve-ts.mjs`, so core files import their siblings without an extension, like everywhere else.
- Riders are students with an approved `riders` row; `profiles.role` stays `student`. `claim_delivery` is a single conditional update, so two riders can never hold one order; keep it that way. Weekly payouts run Monday to Sunday, Indian time.
- Coupons are checked and priced only by `coupon_discount`, inside `place_order` (the cart's `preview_coupon` calls the same function). Fees are charged on the item total before the discount; a discount never exceeds the items.
- Delivery surcharges (a drop point's extra fee, the night fee from 11 PM to 6 AM Indian time) come from `delivery_surcharge` in SQL, mirrored by `deliverySurcharge` in `packages/core/src/bill.ts`; db-tests compare them. Slot rules: `schedule_problem` in SQL and `slotProblem` in `schedule.ts`, also compared.
- Print Store files sit in the private `print-files` bucket. Only the shop the job was ordered from can read one (`can_read_print_file`), only `price-print` can set its page count, and `purge-prints` deletes files through the Storage API a day after the order ends.
- Live tracking uses the private Realtime broadcast channel `track:<order id>`, authorised by `can_use_tracking_channel`; positions are never stored, and location is foreground-only (no background permission in `app.json`). "Allow public access" must be off in the project's Realtime settings.
- Shop owners see reports and staff (`shop_report`, `invite_shop_staff`); counter logins never see money. Campaign pushes are capped at 3 a day.
- Master catalog: every `variants` row is one shop's listing of a `master_products` row (linked automatically by name and size; admins merge duplicates, and the merged name stays an alias). Order items keep their own name and price, so catalog changes never touch old bills.
- Multi-shop carts: `place_cart` routes lines (`route_cart`, also used by the cart preview) and makes one order per shop under one `carts` row. Only the largest order carries the cart's fees (worked out on the whole cart); if it fails, `reassign_cart_fees` moves them to the largest open order. `place_order` is a thin wrapper around the internal `place_shop_order`; change order creation there.
- Stock: a size counts stock only when `stock_qty` is set. Orders take from it (and fail if there isn't enough), failed orders return it, and zero means out of stock. `search_logs` keeps search text without who searched; keep it that way.
- Product photos have 320 px thumbnails at `<folder>/thumbs/<file>` (`thumbPath`). Lists use `ProductImage`, which falls back to the full photo; the shop app uploads both. New stock photos need a thumbnail uploaded beside them.
- Edge Functions type-check with `npx -y deno@2 check --node-modules-dir=none <absolute path>/index.ts` (no global Deno needed).
- Before calling a task done: `npm run typecheck`, `npm run lint`, `npm test`, and for app changes either run it on a phone or bundle it with `npx expo export --platform android` **and** `--platform web`. EAS evaluates every route in Node (no `window`) before each build, and only the web export reproduces that locally.
- Module-level code in the apps must survive running in Node: guard anything that touches `window`, storage or native modules (see `src/lib/supabase.ts`).
