/**
 * A path inside this site to go to after signing in, or null. Only same-site paths are allowed, so a
 * crafted link like /login?redirect=https://elsewhere can't send a student to another website.
 */
export function safePath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  return value;
}

// Google always returns to the home page, so the page to finish on is kept here meanwhile.
const AFTER_LOGIN_KEY = 'campuscart:after-login';
export const rememberAfterLogin = (path: string) => sessionStorage.setItem(AFTER_LOGIN_KEY, path);
export function takeAfterLogin(): string | null {
  const path = safePath(sessionStorage.getItem(AFTER_LOGIN_KEY));
  sessionStorage.removeItem(AFTER_LOGIN_KEY);
  return path;
}
