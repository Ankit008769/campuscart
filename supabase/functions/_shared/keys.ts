// Keys Supabase gives every Edge Function. Projects on the new API keys get JSON dictionaries
// (SUPABASE_SECRET_KEYS, SUPABASE_PUBLISHABLE_KEYS); older ones get the legacy single keys.

function fromDictionary(name: string): string | undefined {
  return (JSON.parse(Deno.env.get(name) ?? '{}') as Record<string, string>).default;
}

/** Bypasses row-level security: use only for work the function itself has checked. */
export function serviceKey(): string {
  return fromDictionary('SUPABASE_SECRET_KEYS') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

/** The public key, for acting as the calling user with their own token. */
export function publishableKey(): string {
  return fromDictionary('SUPABASE_PUBLISHABLE_KEYS') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
}

export const supabaseUrl = (): string => Deno.env.get('SUPABASE_URL') ?? '';
