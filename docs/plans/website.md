# Plan: students order from a website, on the same database as the app

Status: plan only (22 November 2026). Nothing here is built yet.

## Goal

Students can order in a browser as well as in the Android app:

- **Same orders:** an order placed on the web reaches the shop's app and rings like any other.
- **Same menus:** what a shop changes in the app (prices, stock, photos, open/closed) shows on the web at once.
- **Same account:** a student sees the same orders, favourites and addresses on both.

## What the existing website is

[Ankit008769/E-Commerce-Store](https://github.com/Ankit008769/E-Commerce-Store) (cloned at `../E-Commerce-Store`) is a separate MERN build. It is not part of the app.

| | E-Commerce-Store (website) | campuscart (app) |
|---|---|---|
| Database | Its own MongoDB on a GCP VM | Supabase Postgres (pclighjvsijnedapngwg) |
| Server | Express API, about 1,200 lines | Postgres functions and RLS, 155 tests |
| Sign-in | Email + password + email OTP | Google (`@nith.ac.in`), shop IDs |
| Delivery rules | Free over ₹500, else ₹30; late penalty ledger | Free over ₹250, else ₹50; ₹4 platform fee |
| Orders | One order with a group per shop, timer + deductions | One order per shop, 7-minute accept window |
| Hosting | e2-small VM, always on, **billed** | Supabase (free tier) |
| Last change | 5 November | 21 November (1.0.5) |

Its shops, products, users and orders live only in that MongoDB. Its own notes say it "adds no SQL, Supabase, TypeScript migration". The two share no data and no code.

**Pointing it at the app's database is not a small connection job.** Every API route, model and business rule would have to be replaced, because the app's rules live inside Postgres (`place_order`, `transition_order`, fees, coupons, stock, riders). Keeping its Express server would mean writing a second copy of those rules, which then drifts.

## Options

### A. Recommended: publish the app itself as the website

The app is built with Expo, which also builds for the web, and it already has web versions of its tabs and map (`*.web.tsx`). `npx expo export --platform web` builds it today without errors (about 4 MB, tested 22 November).

What that gives you:
- **Same everything:** one codebase, database, set of rules and design. Every fix or feature ships to the app and the site together.
- **Shops need no changes:** they see web orders in their app with the ring, because a web order is just an order.
- **Small effort:** about 1–2 days of work, listed below.
- **Free hosting:** the site is just files to serve, and Supabase is already running. The GCP VM can then be retired.

What it costs:
- The site looks like the app (phone-shaped, centred on desktop) rather than like the current website. A wider desktop layout can come later.
- The current website's UI code isn't reused.

### B. Keep the website's look and rewire it to Supabase

Keep the React/Redux/Tailwind frontend, delete Express and MongoDB, and call Supabase through `@campuscart/core`:
- **Rework:** every Redux API slice and page (products, cart, checkout, orders, profile, rider, admin).
- **Sign-in:** moves to Google.
- **Rules:** the website's fee rules and per-shop delivery groups give way to the app's.

What it costs:
- **Effort:** about 1–2 weeks.
- **Maintenance:** afterwards there are two student front ends to keep in step for every feature and fix.
- **Admin pages:** the website's staff pages duplicate the app and `apps/admin`, so they would be dropped.

**Recommendation: A.** Option B is a rewrite that ends with two apps to maintain; A is a few days that ends with one.

## Plan for A

### 1. Make the web build work for students (about 1 day)

1. **Google sign-in on the web.** `signInWithGoogle` opens an auth session made for phones. On the web:
   - use a normal redirect: `signInWithOAuth` without `skipBrowserRedirect`;
   - finish the sign-in on return with the existing `completeSignInFromUrl`;
   - add the site's URL to Supabase Auth → Redirect URLs.
2. **Hide what only makes sense on a phone:**
   - the Android update gate (`min_android_version_code`);
   - the push-permission prompt;
   - camera barcode scanning (shop side only).
3. **Order updates without push.** While the page is open, the order screen already updates live through Realtime. Add a small banner: "Install the app to get notified when your order is ready", with the Play link.
4. **Shops and admins on the web.** Shops keep the Android app, which has the ring. If a shop or admin ID signs in on the web, show a note pointing them to the app (shops) or `apps/admin` (admins), so nobody relies on a browser tab for alerts.
5. **Web output.** There are no API routes, so switch `app.json` `web.output` from `server` to `single` (or `static`). The build is then plain files that any free host can serve.

### 2. Host it for free (about half a day)

- **Firebase Hosting:** on the existing Firebase project, Spark plan, no billing. Alternatives: Cloudflare Pages or EAS Hosting.
- **Address:** start on the free `*.web.app` address, and add a custom domain later if you buy one.
- **Supabase:** add the site's URL to Supabase's allowed redirect URLs.
- **Deploying:** a one-command deploy script, the same way as the app builds.

### 3. Make it feel like a website (about half a day)

- **Desktop layout:** wider layout on desktop, with a two-column shop grid and the cart as a side panel. `MaxContentWidth` already exists.
- **Installable:** a PWA manifest and icon, so it can be "installed" from the browser. The app icon and brand colours are already in place.
- **Link previews:** page title, description and a preview image, so links shared on WhatsApp show a card.
- **Get the app:** a "Get the Android app" link on every page.

### 4. Retire the old website (owner's decision)

1. Take a final MongoDB and `uploads/` backup from the VM (DEPLOYMENT.md has the commands).
2. Point the old address (`campuscart.34.93.237.251.sslip.io`) at the new site, or show a "we've moved" page.
3. Stop and delete the `campuscart-web` VM and its reserved IP so they stop billing. Keep the last disk snapshot for a while.
4. Archive the E-Commerce-Store repo on GitHub (read-only), so nobody builds on it by mistake.

There is nothing to migrate into Supabase unless the old site had real student orders: the live menus, shops and students are already in the app's database.

### 5. Worth bringing over from the old website (later, in both app and web)

- **Per-item instructions at checkout,** for example "less spicy". The app only has a note per order today.
- **Its campus location list** (431 lines, with aliases like "KBH"). Compare it with the app's 43 drop points for any that are missing.

The app already has its other student features: coupons, riders, scheduled orders, print jobs, favourites, reorder and restock alerts.

### Not in this plan

- **Web push notifications** (order updates in the browser when the tab is closed) can follow once the site is live. They need a service worker and a third token type in send-push.
- **Online payment** stays off; pay at handover is the same on the web.

## How we'll know it works

- **Web to app:** a web order from a student account rings on Sahil's phone and appears on his Orders board.
- **App to web:** a price or stock change in the shop app shows on the web after a refresh, with no redeploy.
- **Same account:** the same student sees the same orders on the web and in the app.
- **Tests:** db-tests are unchanged and still pass. The site adds no server and no new database rules.
