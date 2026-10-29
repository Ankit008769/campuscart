import type { CampusClient, Database } from "@campuscart/core";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    "Supabase is not configured. Copy apps/admin/.env.example to .env.local and fill in the project URL and publishable key.",
  );
}

// Browser sessions only: every page that reads data is a client component behind AdminGate, and
// row-level security decides what an admin may read or change. Google returns with a PKCE code
// that supabase-js exchanges on page load.
export const supabase: CampusClient = createClient<Database>(url, key, {
  auth: { flowType: "pkce" },
});
