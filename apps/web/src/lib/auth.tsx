import { TERMS_VERSION, acceptTerms, completeSignInFromUrl, getMyProfile, startGoogleSignInRedirect } from '@campuscart/core';
import type { Session } from '@supabase/supabase-js';
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

export type Profile = Awaited<ReturnType<typeof getMyProfile>>;

type Auth = {
  session: Session | null;
  profile: Profile | null;
  /** True until the saved session (and the profile, when signed in) has been read. */
  loading: boolean;
  /** Why the last sign-in failed, such as a non-college Google account. */
  error: string | null;
  /** Goes to Google and comes back signed in. `anyAccount` drops the @nith.ac.in hint (Play reviewers, approved Gmail accounts). */
  signIn: (options?: { anyAccount?: boolean }) => Promise<void>;
  signOut: () => Promise<void>;
  reloadProfile: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

// Set when the student ticks "I agree" before going to Google, so the acceptance is recorded once
// they are back and signed in, as the app does.
const TICKED_KEY = 'campuscart:terms-ticked';
export const rememberTermsTicked = () => localStorage.setItem(TICKED_KEY, '1');

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Sign-in failed. Please try again.');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Coming back from Google: swap the one-time code for a session, then take it out of the address bar.
    const url = window.location.href;
    const finishing = completeSignInFromUrl(supabase, url)
      .catch((e: unknown) => setError(messageOf(e)))
      .finally(() => {
        if (/[?#&](code|error)=/.test(url)) window.history.replaceState(null, '', window.location.pathname);
      });
    finishing.then(() =>
      supabase.auth.getSession().then(({ data }) => {
        setSession(data.session);
        setSessionLoading(false);
      }),
    );
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await getMyProfile(supabase, userId));
    } catch (e) {
      setError(messageOf(e));
    }
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Record the terms the student agreed to before signing in (the database keeps the version and time).
  useEffect(() => {
    if (!userId || localStorage.getItem(TICKED_KEY) !== '1') return;
    supabase
      .from('profiles')
      .select('terms_version')
      .eq('id', userId)
      .single()
      .then(async ({ data }) => {
        if (data && data.terms_version < TERMS_VERSION) await acceptTerms(supabase);
        localStorage.removeItem(TICKED_KEY);
      });
  }, [userId]);

  const auth: Auth = {
    session,
    profile,
    loading: sessionLoading || (!!userId && !profile && !error),
    error,
    signIn: async ({ anyAccount = false } = {}) => {
      setError(null);
      await startGoogleSignInRedirect(supabase, {
        redirectTo: `${window.location.origin}/`,
        hostedDomain: anyAccount ? undefined : 'nith.ac.in',
      });
    },
    signOut: async () => {
      await supabase.auth.signOut();
      setProfile(null);
    },
    reloadProfile: loadProfile,
  };

  return <AuthContext value={auth}>{children}</AuthContext>;
}

export function useAuth(): Auth {
  const auth = use(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside AuthProvider');
  return auth;
}
