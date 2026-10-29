import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AppError, OfflineBanner } from '@/components/app-status';
import { AuthProvider, useAuth } from '@/lib/auth';
import { CartProvider } from '@/lib/cart';
import { logStep } from '@/lib/events';
import { registerForOrderPushes, useOpenTappedOrder } from '@/lib/push';

// A crash in any screen shows AppError with a Try again button instead of a blank page.
export { AppError as ErrorBoundary };

// Keep the splash screen up until we know whether a student is already signed in.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <CartProvider>
          <RootNavigator />
        </CartProvider>
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
    logStep('app_open');
    registerForOrderPushes().catch((e: unknown) => console.warn('Could not turn on order notifications', e));
  }, [userId]);
  useOpenTappedOrder(!!session);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="shop/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="cart" options={{ headerShown: true, title: 'Your cart' }} />
          <Stack.Screen name="order/[id]" options={{ headerShown: true, title: 'Order' }} />
          <Stack.Screen name="profile" options={{ headerShown: true, title: 'Your profile' }} />
          <Stack.Screen name="search" options={{ headerShown: true, title: 'Search' }} />
          <Stack.Screen name="rider" options={{ headerShown: true, title: 'Deliver for CampusCart' }} />
          <Stack.Screen name="print" options={{ headerShown: true, title: 'Print Store' }} />
          <Stack.Screen name="cart-status/[id]" options={{ headerShown: true, title: 'Your orders' }} />
          <Stack.Screen name="group/[id]" options={{ headerShown: true, title: 'Group order' }} />
          <Stack.Screen name="group/join/[code]" options={{ headerShown: true, title: 'Joining…' }} />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
      <OfflineBanner />
    </>
  );
}
