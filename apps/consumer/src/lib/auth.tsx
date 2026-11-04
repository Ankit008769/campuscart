import { completeSignInFromUrl, getMyProfile, signInWithGoogle, signInWithId, type Database } from '@campuscart/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { resetLoggedSteps } from '@/lib/events';
import { forgetThisPhone } from '@/lib/push';
import { supabase } from '@/lib/supabase';

/** Which part of the app opens: students order, shop owners and counter staff run their shop, admins run the shops. */
export type Side = 'student' | 'shop' | 'admin';

type Auth = {
  session: Session | null;
  /** True until the saved session has been read and, when someone is signed in, their side is known. */
  loading: boolean;
  /** The signed-in person's side, from their role in the database. Null when signed out. */
  side: Side | null;
  /** An admin who has the password right but hasn't given their Google Authenticator code yet. */
  needsAdminCode: boolean;
  /** Why the last sign-in failed, when the failure arrived through the return link. */
  authError: string | null;
  /** Students sign in with Google. Resolves to false if the Google page was closed. Throws if sign-in was refused. */
  signIn: (options?: { anyAccount?: boolean }) => Promise<boolean>;
  /** Shops and admins sign in with the ID and password an admin gave them. Throws if they are wrong. */
  signInWithLogin: (loginId: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

// Google hands control back to the app root, a route that always exists.
const redirectTo = Linking.createURL('');

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Sign-in failed. Please try again.');

type Role = Database['public']['Enums']['user_role'];
const sideOf = (role: Role): Side => {
  if (role === 'admin') return 'admin';
  return role === 'merchant_owner' || role === 'merchant_staff' ? 'shop' : 'student';
};

// The side each account last opened, so the next launch goes straight there, even offline. The way
// someone signed in is the fallback when the role can't be read right after signing in. Admin is
// never remembered: it always comes from the database.
const sideKey = (userId: string) => `campuscart:side:${userId}`;
const PICKED_KEY = 'campuscart:side:picked';

async function readSide(key: string): Promise<Side | null> {
  const value = await AsyncStorage.getItem(key).catch(() => null);
  return value === 'student' || value === 'shop' ? value : null;
}

async function endSession() {
  // While still signed in, so row-level security lets us delete our own token.
  await forgetThisPhone().catch(() => {});
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  resetLoggedSteps();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [resolved, setResolved] = useState<{ userId: string; side: Side } | null>(null);
  const [codeCheck, setCodeCheck] = useState<{ userId: string; passed: boolean } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
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

  // The role decides the side, not the button tapped: a student account that picked "shop" still
  // opens the student side, and row-level security guards the data whichever side is showing.
  const userId = session?.user.id;
  const provider = session?.user.app_metadata.provider;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const settle = (side: Side) => {
      if (active) setResolved({ userId, side });
    };
    (async () => {
      const remembered = await readSide(sideKey(userId));
      if (remembered) settle(remembered);
      try {
        const side = sideOf((await getMyProfile(supabase, userId)).role);
        // Shops have IDs now. A shop's old Google account can't open the shop side any more.
        if (side === 'shop' && provider === 'google') {
          setAuthError('Shops now sign in with the ID and password from the CampusCart team.');
          await AsyncStorage.removeItem(sideKey(userId)).catch(() => {});
          await endSession().catch(() => {});
          return;
        }
        settle(side);
        if (side !== 'admin') AsyncStorage.setItem(sideKey(userId), side).catch(() => {});
      } catch {
        if (!remembered) settle((await readSide(PICKED_KEY)) ?? 'student');
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, provider]);

  // The session changes when the Authenticator code is accepted, so check again on each new token.
  const token = session?.access_token;
  useEffect(() => {
    if (!userId || !token) return;
    let active = true;
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (active) setCodeCheck({ userId, passed: data?.currentLevel === 'aal2' });
    });
    return () => {
      active = false;
    };
  }, [userId, token]);

  const known = userId && resolved?.userId === userId ? resolved.side : null;
  const codeKnown = !!userId && codeCheck?.userId === userId;
  const needsAdminCode = known === 'admin' && codeKnown && !codeCheck.passed;
  const side = known === 'admin' && !(codeKnown && codeCheck.passed) ? null : known;

  const auth: Auth = {
    session,
    loading: sessionLoading || (!!userId && !side && !needsAdminCode),
    side,
    needsAdminCode,
    authError,
    signIn: async ({ anyAccount = false } = {}) => {
      setAuthError(null);
      await AsyncStorage.setItem(PICKED_KEY, 'student').catch(() => {});
      return signInWithGoogle(supabase, {
        redirectTo,
        openAuthSession: WebBrowser.openAuthSessionAsync,
        // Students use their college account. The Gmail accounts an admin approved, such as the
        // Play review account, can't get past this hint, so they ask for any account.
        hostedDomain: anyAccount ? undefined : 'nith.ac.in',
      });
    },
    signInWithLogin: async (loginId, password) => {
      setAuthError(null);
      await AsyncStorage.setItem(PICKED_KEY, 'shop').catch(() => {});
      await signInWithId(supabase, loginId, password);
    },
    signOut: endSession,
  };

  return <AuthContext value={auth}>{children}</AuthContext>;
}

export function useAuth(): Auth {
  const auth = use(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside AuthProvider');
  return auth;
}
