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

```bash
npm run build -w @campuscart/web                # plain files in apps/web/dist
```

Any static host works; `firebase.json` is set up for Firebase Hosting (free Spark plan), with every
path served `index.html` so links like `/order/<id>` open directly.

Before the first real sign-in on a new address, add it in Supabase → Authentication → URL
Configuration → Redirect URLs (for example `https://<site>/`), or Google sign-in will refuse to
come back to it.

## What's not here (yet)

- Student rider, Print Store and group orders: in the app.
- Scheduled orders: in the app (the website places orders for now).
- Browser notifications: the order page updates live while open; the app notifies when closed.
