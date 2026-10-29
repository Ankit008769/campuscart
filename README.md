# CampusCart

Order from every shop at NIT Hamirpur and get it at your hostel. This repo holds the student app, the shop app, the admin panel and their shared code. Team conventions are in [CLAUDE.md](CLAUDE.md).

## Set up your machine

1. Install Node.js 24 LTS and Git.
2. Clone the repo and run `npm install` in its root.
3. To test on your own phone (fastest): install **Expo Go** from the Play Store.
4. To use an emulator: open Android Studio and finish its setup wizard. Put the SDK on a drive with space (for example `E:\Android\Sdk`). Then:
   - set the `ANDROID_HOME` user environment variable to that SDK folder;
   - add `%ANDROID_HOME%\platform-tools` to `PATH`;
   - in Android Studio, open **Device Manager** and create a virtual device (a Pixel phone with the latest Android image).

## Run the apps

```bash
npm run consumer
```

- Phone: scan the QR code with Expo Go. Phone and laptop must be on the same Wi-Fi.
- Emulator: start it from Device Manager, then press `a` in the terminal.
- If campus Wi-Fi blocks the connection, run `npx expo start --tunnel` inside `apps/consumer`.

`npm run merchant` does the same for the shop app. `npm run admin` serves the admin panel at http://localhost:3000.

## Install a build on a phone

Android builds run on Expo's servers (EAS), because local Windows builds hit the 260-character path limit. From `apps/consumer` or `apps/merchant`:

```bash
npx eas-cli@latest build --platform android --profile preview
```

Open the APK link it prints on the phone, or install it over USB with `adb install -r <file>.apk`. On Redmi and other Xiaomi phones, turn on **Install via USB** in Developer options first.

## Database

`supabase/` holds the Supabase project: migrations for the schema, security rules and order engine, plus `seed.sql` with the campus hostels and sample shops. `npm test` runs every migration in PGlite, an in-process Postgres, so database tests need neither Docker nor an account.

The live project is in Mumbai (`ap-south-1`) and the repo is linked to it. After adding a migration, run `npm run db:push` and then `npm run db:types`. Copy each app's `.env.example` to `.env` (admin: `.env.local`) and fill in the project URL and publishable key from Supabase → Project Settings → API Keys.

To run the full Supabase stack locally (needs Docker Desktop):

```bash
npx supabase start
```

The first admin: before signing in for the first time, add your email with `insert into public.allowed_logins (email, role) values ('you@example.com', 'admin');`. Students need no setup; any @nith.ac.in account can sign up.

## Check your work

```bash
npm run typecheck
npm run lint
npm test
```
