import type { CampusClient } from './api';

export type AuthRedirect = { code: string } | { error: string };

// Anyone can send a campuscart:// link, so a refusal's text is shown only when it is one the database
// itself writes (the sign-up hook in 20261026100100_auth.sql); any other text becomes a fixed line.
// Otherwise a crafted link would put the sender's words ("account suspended, pay ₹99 to…") on the
// app's own sign-in screen.
const KNOWN_REFUSALS = new Set(['Sign in with your @nith.ac.in college account.']);
export const SIGN_IN_FAILED = 'Sign-in did not finish. Please try again.';

/**
 * Reads what Supabase appended to the app's return link after Google sign-in: a PKCE code on
 * success, or why it was refused (for example when the sign-up hook refuses a non-college email).
 */
export function parseAuthRedirect(url: string): AuthRedirect | null {
  const [beforeFragment, fragment = ''] = url.split('#');
  const query = beforeFragment.split('?')[1] ?? '';
  const params = new URLSearchParams([query, fragment].filter(Boolean).join('&'));

  const error = params.get('error_description') ?? params.get('error');
  if (error) return { error: KNOWN_REFUSALS.has(error) ? error : SIGN_IN_FAILED };
  const code = params.get('code');
  return code ? { code } : null;
}

/** Opens a sign-in page in an in-app browser tab and resolves once it redirects to `redirectTo`. */
export type OpenAuthSession = (url: string, redirectTo: string) => Promise<{ type: string; url?: string }>;

type CodeExchanger = { auth: Pick<CampusClient['auth'], 'exchangeCodeForSession'> };

// A PKCE code works once. Android can deliver the same return link twice (the browser tab's result
// and the app's deep-link event), so remember which codes were already exchanged.
const exchangedCodes = new Set<string>();

/**
 * Finishes Google sign-in from the app's return link. Safe to call from every path that may receive
 * it. Resolves to true if the link completed (or is already completing) a sign-in, false if it isn't
 * a sign-in return link, and throws with Supabase's message if sign-in was refused.
 */
export async function completeSignInFromUrl(client: CodeExchanger, url: string): Promise<boolean> {
  const redirect = parseAuthRedirect(url);
  if (!redirect) return false;
  if ('error' in redirect) throw new Error(redirect.error);
  if (exchangedCodes.has(redirect.code)) return true;

  exchangedCodes.add(redirect.code);
  const { error } = await client.auth.exchangeCodeForSession(redirect.code);
  if (error) throw error;
  return true;
}

/**
 * Google sign-in through Supabase in an in-app browser tab, using PKCE (the client must be created
 * with `flowType: 'pkce'`). Resolves to false if the browser tab closed without handing back a link,
 * and throws with a readable message if sign-in was refused.
 *
 * On Android the tab often reports "dismiss" even when Google did redirect, because the app returns to
 * the foreground before the link event arrives. Apps must therefore also pass incoming links to
 * completeSignInFromUrl (see each app's src/lib/auth.tsx).
 */
export async function signInWithGoogle(
  client: CampusClient,
  options: { redirectTo: string; openAuthSession: OpenAuthSession; hostedDomain?: string },
): Promise<boolean> {
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: options.redirectTo,
      skipBrowserRedirect: true,
      // hd only pre-selects college accounts; the database sign-up hook is what enforces it.
      queryParams: { prompt: 'select_account', ...(options.hostedDomain ? { hd: options.hostedDomain } : {}) },
    },
  });
  if (error) throw error;

  const result = await options.openAuthSession(data.url, options.redirectTo);
  if (result.type !== 'success' || !result.url) return false;

  if (!(await completeSignInFromUrl(client, result.url))) {
    throw new Error('Sign-in did not finish. Please try again.');
  }
  return true;
}
