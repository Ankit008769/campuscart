import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AppError, OfflineBanner } from '@/components/app-status';
import { AuthProvider, useAuth } from '@/lib/auth';
import { registerForOrderPushes, useOpenTappedOrder } from '@/lib/push';

// A crash in any screen shows AppError with a Try again button instead of a blank page.
export { AppError as ErrorBoundary };

// Keep the splash screen up until we know whether someone is already signed in.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  useEffect(() => {
    if (!userId) return;
    registerForOrderPushes().catch((e: unknown) => console.warn('Could not turn on order notifications', e));
  }, [userId]);
  useOpenTappedOrder(!!session);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="item/[id]" options={{ headerShown: true, title: 'Item' }} />
          <Stack.Screen name="scan" options={{ headerShown: true, title: 'Scan to restock' }} />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
      <OfflineBanner />
    </>
  );
}
