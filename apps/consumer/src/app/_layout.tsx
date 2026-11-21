import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AppError, OfflineBanner } from '@/components/app-status';
import { AuthProvider, useAuth } from '@/lib/auth';
import { CartProvider } from '@/lib/cart';
import { logStep } from '@/lib/events';
import { registerForOrderPushes, useOpenTappedOrder } from '@/lib/push';
import { TermsGate } from '@/lib/terms';
import { UpdateRequired, useUpdateRequired } from '@/lib/update-gate';

// A crash in any screen shows AppError with a Try again button instead of a blank page.
export { AppError as ErrorBoundary };

// Keep the splash screen up until we know who is signed in and which side of the app is theirs.
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
  const { session, side, needsAdminCode, loading } = useAuth();
  const updateRequired = useUpdateRequired();
  const userId = session?.user.id;

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  useEffect(() => {
    if (!userId || !side || side === 'admin') return;
    if (side === 'student') logStep('app_open');
    registerForOrderPushes(side).catch((e: unknown) => console.warn('Could not turn on order notifications', e));
  }, [userId, side]);
  useOpenTappedOrder(side === 'admin' ? null : side);

  // Admins can require a newer build (app_settings); nothing else opens until it is installed.
  if (updateRequired) return <UpdateRequired />;

  // Signed out (or still finding out the side) shows sign-in, where people pick student or shop.
  // Students get the ordering screens; shop owners and counter staff get the shop screens under /partner;
  // admins get /admin, but only past the Authenticator code, which admin-sign-in asks for.
  return (
    <>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Protected guard={side === 'student'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="shop/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="cart" options={{ headerShown: true, title: 'Your cart' }} />
          <Stack.Screen name="order/[id]" options={{ headerShown: true, title: 'Order' }} />
          <Stack.Screen name="profile" options={{ headerShown: true, title: 'Your profile' }} />
          <Stack.Screen name="search" options={{ headerShown: true, title: 'Search' }} />
          <Stack.Screen name="rider" options={{ headerShown: true, title: 'Deliver for CampusCart' }} />
          <Stack.Screen name="suggest" options={{ headerShown: true, title: 'Suggestions' }} />
          {/* Students open it from Account; before sign-in it opens as an overlay (TermsAgree), so no
              screen sits outside the guards for the router to fall back to. */}
          <Stack.Screen name="terms" options={{ headerShown: true, title: 'Terms & Conditions' }} />
          <Stack.Screen name="print" options={{ headerShown: true, title: 'Print Store' }} />
          <Stack.Screen name="cart-status/[id]" options={{ headerShown: true, title: 'Your orders' }} />
          <Stack.Screen name="group/[id]" options={{ headerShown: true, title: 'Group order' }} />
          <Stack.Screen name="group/join/[code]" options={{ headerShown: true, title: 'Joining…' }} />
        </Stack.Protected>
        <Stack.Protected guard={side === 'shop'}>
          <Stack.Screen name="partner" />
        </Stack.Protected>
        <Stack.Protected guard={side === 'admin'}>
          <Stack.Screen name="admin" />
        </Stack.Protected>
        <Stack.Protected guard={!side && !needsAdminCode}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="shop-sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={!side}>
          <Stack.Screen name="admin-sign-in" />
        </Stack.Protected>
      </Stack>
      <OfflineBanner />
      <TermsGate userId={userId ?? null} side={side} />
    </>
  );
}
