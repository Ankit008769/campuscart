import type { CampusClient, Database } from '@campuscart/core';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

if (!SUPABASE_URL || !key) {
  throw new Error('Supabase is not configured. Copy apps/web/.env.example to .env and fill in the project URL and publishable key.');
}

// The same project, rules and data as the Android app. Google sign-in comes back to this site with a
// one-time code (PKCE), which lib/auth.tsx exchanges with completeSignInFromUrl.
export const supabase: CampusClient = createClient<Database>(SUPABASE_URL, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
});
