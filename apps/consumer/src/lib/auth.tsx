import { completeSignInFromUrl, getMyProfile, signInWithGoogle, type Database } from '@campuscart/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { resetLoggedSteps } from '@/lib/events';
import { forgetThisPhone } from '@/lib/push';
import { supabase } from '@/lib/supabase';

/** Which half of the app opens: students order, shop owners and counter staff run their shop. */
export type Side = 'student' | 'shop';

type Auth = {
  session: Session | null;
  /** True until the saved session has been read and, when someone is signed in, their side is known. */
  loading: boolean;
  /** The signed-in person's side, from their role in the database. Null when signed out. */
  side: Side | null;
  /** Why the last sign-in failed, when the failure arrived through the return link. */
  authError: string | null;
  /** Resolves to false if the Google page was closed. Throws if sign-in was refused. */
  signIn: (side: Side) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

// Google hands control back to the app root, a route that always exists.
const redirectTo = Linking.createURL('');

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Sign-in failed. Please try again.');

type Role = Database['public']['Enums']['user_role'];
const sideOf = (role: Role): Side => (role === 'merchant_owner' || role === 'merchant_staff' ? 'shop' : 'student');

// The side each account last opened, so the next launch goes straight there, even offline. The side
// picked on the sign-in screen is the fallback when the role can't be read right after signing in.
const sideKey = (userId: string) => `campuscart:side:${userId}`;
const PICKED_KEY = 'campuscart:side:picked';

async function readSide(key: string): Promise<Side | null> {
  const value = await AsyncStorage.getItem(key).catch(() => null);
  return value === 'student' || value === 'shop' ? value : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [resolved, setResolved] = useState<{ userId: string; side: Side } | null>(null);
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
        settle(side);
        AsyncStorage.setItem(sideKey(userId), side).catch(() => {});
      } catch {
        if (!remembered) settle((await readSide(PICKED_KEY)) ?? 'student');
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const side = userId && resolved?.userId === userId ? resolved.side : null;

  const auth: Auth = {
    session,
    loading: sessionLoading || (!!userId && !side),
    side,
    authError,
    signIn: async (picked) => {
      setAuthError(null);
      await AsyncStorage.setItem(PICKED_KEY, picked).catch(() => {});
      return signInWithGoogle(supabase, {
        redirectTo,
        openAuthSession: WebBrowser.openAuthSessionAsync,
        // Students use their college account; shop owners and staff use the Gmail an admin approved.
        hostedDomain: picked === 'student' ? 'nith.ac.in' : undefined,
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
