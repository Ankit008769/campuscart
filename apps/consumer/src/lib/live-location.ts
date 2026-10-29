import { TRACKING_INTERVAL_MS, trackingTopic, type RiderPosition } from '@campuscart/core';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * While `active` (an order this rider is carrying, with the delivery screen open), sends the phone's
 * position every 5 seconds on the order's private tracking channel. Foreground only: it stops when
 * the screen closes, the app goes to the background, or the order stops being out for delivery,
 * and the database refuses positions after that anyway. Returns whether location is being shared.
 */
export function useShareRiderLocation(orderId: string, active: boolean): 'sharing' | 'denied' | 'off' {
  const [state, setState] = useState<'sharing' | 'denied' | 'off'>('off');

  useEffect(() => {
    if (!active || Platform.OS === 'web') return;
    let stopped = false;
    let removeWatch: (() => void) | null = null;
    const channel = supabase.channel(trackingTopic(orderId), { config: { private: true } });
    channel.subscribe();

    (async () => {
      // Loaded here: the location module is native, and routes are also evaluated in Node.
      const Location = await import('expo-location');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (stopped) return;
      if (!permission.granted) {
        setState('denied');
        return;
      }
      const watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: TRACKING_INTERVAL_MS, distanceInterval: 5 },
        (position) => {
          const payload: RiderPosition = { lat: position.coords.latitude, lng: position.coords.longitude, at: position.timestamp };
          channel.send({ type: 'broadcast', event: 'position', payload });
        },
      );
      if (stopped) watch.remove();
      else {
        removeWatch = () => watch.remove();
        setState('sharing');
      }
    })().catch(() => !stopped && setState('denied'));

    return () => {
      stopped = true;
      removeWatch?.();
      supabase.removeChannel(channel);
      setState('off');
    };
  }, [orderId, active]);

  return active ? state : 'off';
}

/** The latest position the rider of this order shared, while `active` (out for delivery). */
export function useRiderPosition(orderId: string, active: boolean): RiderPosition | null {
  const [position, setPosition] = useState<RiderPosition | null>(null);

  useEffect(() => {
    if (!active) return;
    const channel = supabase
      .channel(trackingTopic(orderId), { config: { private: true } })
      .on('broadcast', { event: 'position' }, ({ payload }) => {
        const p = payload as Partial<RiderPosition>;
        if (typeof p.lat === 'number' && typeof p.lng === 'number') {
          setPosition({ lat: p.lat, lng: p.lng, at: typeof p.at === 'number' ? p.at : Date.now() });
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, active]);

  return active ? position : null;
}
