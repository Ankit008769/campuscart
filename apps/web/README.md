# Campus Cart website (apps/web)

The student website: order from campus shops in a browser. It looks like the earlier MERN site
(Ankit008769/E-Commerce-Store, whose stylesheets are in `src/styles/`), but it has no server or
database of its own. Everything goes through `@campuscart/core` to the same Supabase project as
the Android app:

- an order placed here is an ordinary order (`place_cart`), so it reaches the shop's app and rings;
- menus, prices, stock and photos are read live from the shops' own data;
- a student signs in with the same Google account and sees the same orders, favourites and profile.

Shops keep using the Android app (it rings even when closed); admins use `apps/admin`.

## Run locally

```bash
cp apps/web/.env.example apps/web/.env.local   # project URL and publishable key (both public)
npm run web                                     # http://localhost:5173
```

## Build and host

Live at **https://campuscart-nith.web.app** (Firebase Hosting, site `campuscart-nith` in the
Campus Cart Firebase project, free Spark plan). To deploy a new version:

```bash
cd apps/web
VITE_SUPABASE_URL=https://pclighjvsijnedapngwg.supabase.co VITE_SUPABASE_KEY=sb_publishable_... npm run build
npx firebase-tools@15.37.0 deploy --only hosting
```

Pass the live values on the command line (or in `.env.production.local`), because `.env.local`
points at the local stack. Every path serves `index.html` (see `firebase.json`), so links like
`/order/<id>` open directly.

Google sign-in only comes back to addresses listed in Supabase → Authentication → URL
Configuration → Redirect URLs; `https://campuscart-nith.web.app/` must be there.

## What's not here (yet)

- Student rider, Print Store and group orders: in the app.
- Scheduled orders: in the app (the website places orders for now).
- Browser notifications: the order page updates live while open; the app notifies when closed.
