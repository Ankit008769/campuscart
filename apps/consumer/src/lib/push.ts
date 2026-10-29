import { forgetDeviceToken, registerDeviceToken } from '@campuscart/core';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
// Named imports: the lint import plugin misses these enums on the namespace (they are exported).
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Pushes need a real phone; web and emulators skip all of this.
const supported = () => Platform.OS !== 'web' && Device.isDevice;

// The token this phone saved for the signed-in student, so signing out can remove it.
let savedToken: string | null = null;

/**
 * Asks for permission, creates the Android "orders" channel the server sends to, and saves this
 * phone's push token for the signed-in student. Does nothing when permission is refused.
 */
export async function registerForOrderPushes(): Promise<void> {
  if (!supported()) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    // Android 13+ shows the permission prompt only once a channel exists.
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'Order updates',
      importance: AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return;

  const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerDeviceToken(supabase, 'consumer', token);
  savedToken = token;
}

/** Stops pushes to this phone, so whoever signs in next doesn't get this student's updates. */
export async function forgetThisPhone(): Promise<void> {
  if (!savedToken) return;
  const token = savedToken;
  savedToken = null;
  await forgetDeviceToken(supabase, token);
}

/** Opens what a tapped notification is about, including the tap that launched the app. */
export function useOpenTappedOrder(enabled: boolean) {
  useEffect(() => {
    if (!supported() || !enabled) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data;
      // Rider pushes (offers, ready for pickup) carry deliveryId; order updates carry orderId.
      if (typeof data?.deliveryId === 'string') router.push('/rider');
      else if (typeof data?.shopId === 'string') router.push({ pathname: '/shop/[id]', params: { id: data.shopId } });
      else if (typeof data?.orderId === 'string') router.push({ pathname: '/order/[id]', params: { id: data.orderId } });
    };
    open(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [enabled]);
}
