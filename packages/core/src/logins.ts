import type { CampusClient } from './api';

/**
 * ID-and-password sign-in for shops and admins, and the Google Authenticator step admins add to it.
 * An ID is the auth account <id>@logins.campuscart.invalid: nobody types that part, and no email
 * ever goes to it. Same rules as supabase/functions/shop-logins.
 */

const LOGIN_DOMAIN = 'logins.campuscart.invalid';
const LOGIN_ID = /^[a-z0-9][a-z0-9._-]{2,29}$/;
export const MIN_PASSWORD = 8;

export type StaffJob = 'owner' | 'counter';

const cleanId = (loginId: string) => loginId.trim().toLowerCase();

export function isLoginId(loginId: string): boolean {
  return LOGIN_ID.test(cleanId(loginId));
}

/** The ID in an account's address, or null for an account that signs in with Google. */
export function loginIdOf(email: string | null | undefined): string | null {
  return email?.endsWith(`@${LOGIN_DOMAIN}`) ? email.slice(0, -LOGIN_DOMAIN.length - 1) : null;
}

/** Signs in with an ID and password. Admins then still need the Authenticator step. */
export async function signInWithId(client: CampusClient, loginId: string, password: string) {
  const { error } = await client.auth.signInWithPassword({ email: `${cleanId(loginId)}@${LOGIN_DOMAIN}`, password });
  if (error) {
    const wrong = error.code === 'invalid_credentials' || error.status === 400;
    throw new Error(wrong ? 'That ID or password is wrong.' : error.message);
  }
}

async function callShopLogins<T>(client: CampusClient, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.functions.invoke<T>('shop-logins', { body });
  if (error) {
    // The function answers errors as {"error": "..."}; show that rather than a generic HTTP message.
    const context: unknown = 'context' in error ? error.context : null;
    const answer = context instanceof Response ? await context.json().catch(() => null) : null;
    throw new Error(typeof answer?.error === 'string' ? answer.error : 'Could not change the login. Try again.');
  }
  if (!data) throw new Error('Could not change the login. Try again.');
  return data;
}

export type NewShopLogin = { shopId: string; loginId: string; password: string; name: string; staffRole: StaffJob };

/** Gives someone an ID for a shop. Admins can make owners and counter staff; owners, counter staff. */
export async function createShopLogin(client: CampusClient, login: NewShopLogin) {
  return callShopLogins<{ profileId: string; loginId: string }>(client, { action: 'create', ...login });
}

/**
 * Admins only: adds an ID someone already has to another shop, so one login takes the orders of
 * several outlets of the same owner. Its password and other shops stay as they are.
 */
export async function linkShopLogin(client: CampusClient, shopId: string, loginId: string, staffRole: StaffJob) {
  return callShopLogins<{ profileId: string; loginId: string }>(client, { action: 'link', shopId, loginId, staffRole });
}

export async function resetShopLoginPassword(client: CampusClient, shopId: string, profileId: string, password: string) {
  await callShopLogins(client, { action: 'reset', shopId, profileId, password });
}

/**
 * Takes someone off the shop. An ID still at another outlet keeps working there; otherwise an ID is
 * locked for good and a Google account becomes an ordinary account.
 */
export async function removeShopLogin(client: CampusClient, shopId: string, profileId: string) {
  await callShopLogins(client, { action: 'remove', shopId, profileId });
}

export type AuthenticatorSetup = { factorId: string; qrCode: string; secret: string; uri: string };

/** Where an admin stands: past the code already, or the Authenticator they must enter a code from. */
export async function authenticatorStatus(client: CampusClient) {
  const [{ data: level, error: levelError }, { data: factors, error: factorsError }] = await Promise.all([
    client.auth.mfa.getAuthenticatorAssuranceLevel(),
    client.auth.mfa.listFactors(),
  ]);
  if (levelError) throw levelError;
  if (factorsError) throw factorsError;
  return { passed: level.currentLevel === 'aal2', factorId: factors.totp[0]?.id ?? null };
}

/** Starts linking Google Authenticator, clearing any setup that was left unfinished. */
export async function startAuthenticatorSetup(client: CampusClient): Promise<AuthenticatorSetup> {
  const { data: factors, error: listError } = await client.auth.mfa.listFactors();
  if (listError) throw listError;
  for (const factor of factors.all) {
    if (factor.status === 'unverified') await client.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', issuer: 'CampusCart', friendlyName: 'Google Authenticator' });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
}

/** Checks a 6-digit code; on success the session is past the Authenticator step. */
export async function verifyAuthenticatorCode(client: CampusClient, factorId: string, code: string) {
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error) throw new Error(error.code === 'mfa_verification_failed' ? 'That code is wrong or has expired.' : error.message);
}
