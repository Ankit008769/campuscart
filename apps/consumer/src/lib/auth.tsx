import { completeSignInFromUrl, signInWithGoogle } from '@campuscart/core';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { resetLoggedSteps } from '@/lib/events';
import { forgetThisPhone } from '@/lib/push';
import { supabase } from '@/lib/supabase';

type Auth = {
  session: Session | null;
  /** True until the saved session has been read from storage. */
  loading: boolean;
  /** Why the last sign-in failed, when the failure arrived through the return link. */
  authError: string | null;
  /** Resolves to false if the student closed the Google page. Throws if sign-in was refused. */
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

// Google hands control back to the app root, a route that always exists.
const redirectTo = Linking.createURL('');

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Sign-in failed. Please try again.');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // On Android the browser tab can report "dismiss" while the return link arrives here instead,
  // so finish sign-in from incoming links too (including the one that cold-started the app).
  useEffect(() => {
    const finish = (url: string | null) => {
      if (url) completeSignInFromUrl(supabase, url).catch((e: unknown) => setAuthError(messageOf(e)));
    };
    Linking.getInitialURL().then(finish);
    const subscription = Linking.addEventListener('url', ({ url }) => finish(url));
    return () => subscription.remove();
  }, []);

  const auth: Auth = {
    session,
    loading,
    authError,
    signIn: () => {
      setAuthError(null);
      return signInWithGoogle(supabase, {
        redirectTo,
        openAuthSession: WebBrowser.openAuthSessionAsync,
        hostedDomain: 'nith.ac.in',
      });
    },
    signOut: async () => {
      // While still signed in, so row-level security lets us delete our own token.
      await forgetThisPhone().catch(() => {});
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      resetLoggedSteps();
    },
  };

  return <AuthContext value={auth}>{children}</AuthContext>;
}

export function useAuth(): Auth {
  const auth = use(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside AuthProvider');
  return auth;
}
