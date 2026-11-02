import { forgetDeviceToken, registerDeviceToken } from '@campuscart/core';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
// Named imports: the lint import plugin misses these enums on the namespace (they are exported).
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import type { Side } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// Pushes need a real phone; web and emulators skip all of this.
const supported = () => Platform.OS !== 'web' && Device.isDevice;

// The token this phone saved for the signed-in person, so signing out can remove it.
let savedToken: string | null = null;

/**
 * Creates the Android channel the server sends this side's pushes to. Each side has its own channel
 * because Android fixes a channel's sound once it exists, and one phone may sign in as either side.
 * send-push uses the same channel ids.
 */
async function createChannel(side: Side) {
  if (side === 'student') {
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'Order updates',
      importance: AndroidImportance.HIGH,
    });
    return;
  }
  // Loud on purpose: a new order expires if nobody accepts it within 3 minutes.
  await Notifications.setNotificationChannelAsync('new-orders', {
    name: 'New orders for your shop',
    importance: AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500, 250, 500],
    // Bundled by the expo-notifications plugin (app.json "sounds"); the same ring plays in the app.
    sound: 'new_order.wav',
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
  });
}

/**
 * Asks for permission, creates this side's Android channel, and saves this phone's push token for
 * the signed-in person. Does nothing when permission is refused.
 */
export async function registerForOrderPushes(side: Side): Promise<void> {
  if (!supported()) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  // Android 13+ shows the permission prompt only once a channel exists.
  if (Platform.OS === 'android') await createChannel(side);
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return;

  const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerDeviceToken(supabase, side === 'shop' ? 'merchant' : 'consumer', token);
  savedToken = token;
}

/** Stops pushes to this phone, so whoever signs in next doesn't get this person's orders. */
export async function forgetThisPhone(): Promise<void> {
  if (!savedToken) return;
  const token = savedToken;
  savedToken = null;
  await forgetDeviceToken(supabase, token);
}

/** Opens what a tapped notification is about, including the tap that launched the app. */
export function useOpenTappedOrder(side: Side | null) {
  useEffect(() => {
    if (!supported() || !side) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data;
      if (side === 'shop') {
        // Shop pushes are all about orders, which the orders board shows.
        if (typeof data?.orderId === 'string') router.navigate('/partner');
        return;
      }
      // Rider pushes (offers, ready for pickup) carry deliveryId, and cash handovers screen: rider;
      // order updates carry orderId.
      if (typeof data?.deliveryId === 'string' || data?.screen === 'rider') router.push('/rider');
      else if (typeof data?.shopId === 'string') router.push({ pathname: '/shop/[id]', params: { id: data.shopId } });
      else if (typeof data?.orderId === 'string') router.push({ pathname: '/order/[id]', params: { id: data.orderId } });
    };
    open(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [side]);
}
