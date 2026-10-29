import 'react-native-url-polyfill/auto';

import type { CampusClient, Database } from '@campuscart/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    'Supabase is not configured. Copy apps/consumer/.env.example to .env and fill in the project URL and publishable key.',
  );
}

// Expo Router also runs this module in Node to build its web route manifest (locally for web exports,
// and on EAS before every build). There is no window or storage there, so skip the session entirely.
// React Native always defines window, so phones are unaffected.
const isServer = typeof window === 'undefined';

export const supabase: CampusClient = createClient<Database>(url, key, {
  auth: {
    storage: isServer ? undefined : AsyncStorage,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: false,
    // Google sign-in returns a one-time code to the app, never the tokens themselves.
    flowType: 'pkce',
  },
});

// Refresh the session only while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
