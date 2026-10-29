import { forgetDeviceToken, registerDeviceToken } from '@campuscart/core';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
// Named imports: the lint import plugin misses these enums on the namespace (they are exported).
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Pushes need a real phone; web and emulators skip all of this.
const supported = () => Platform.OS !== 'web' && Device.isDevice;

// The token this phone saved for the signed-in staff member, so signing out can remove it.
let savedToken: string | null = null;

/**
 * Asks for permission, creates the Android "orders" channel the server sends to, and saves this
 * phone's push token for the signed-in staff member. Does nothing when permission is refused.
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
    // Loud on purpose: a new order expires if nobody accepts it within 3 minutes.
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'New orders',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500, 250, 500],
      // Bundled by the expo-notifications plugin (app.json "sounds"); the same ring plays in the app.
      sound: 'new_order.wav',
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return;

  const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerDeviceToken(supabase, 'merchant', token);
  savedToken = token;
}

/** Stops pushes to this phone, so a phone handed to someone else stops ringing for this shop. */
export async function forgetThisPhone(): Promise<void> {
  if (!savedToken) return;
  const token = savedToken;
  savedToken = null;
  await forgetDeviceToken(supabase, token);
}

/** Brings up the orders board when a notification is tapped, including the tap that launched the app. */
export function useOpenTappedOrder(enabled: boolean) {
  useEffect(() => {
    if (!supported() || !enabled) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (typeof response?.notification.request.content.data?.orderId === 'string') router.navigate('/');
    };
    open(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [enabled]);
}
