import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useEffect, useState } from 'react';
import { Platform, Vibration } from 'react-native';

// A strong, repeating buzz so a new order is noticed at a busy counter.
const BUZZ = [0, 700, 300, 700, 300, 700];

/**
 * Rings and buzzes on a loop while a new order is waiting that nobody at the counter has seen.
 * silence() marks every order waiting right now as seen, so only a newer order rings again, and
 * handled(id) stops the ring the moment staff tap Accept or Reject, without waiting for the list
 * to reload.
 */
export function useNewOrderAlarm(waitingOrderIds: readonly string[]) {
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const ringing = waitingOrderIds.some((id) => !seen.has(id));

  useEffect(() => {
    // Ring even with the phone on silent: an order nobody accepts is dropped after 7 minutes.
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!ringing) return;
    // A fresh player per ringing spell, released as soon as it stops.
    const player = createAudioPlayer(require('@/assets/sounds/new_order.wav'));
    player.loop = true;
    player.play();
    if (Platform.OS !== 'web') Vibration.vibrate(BUZZ, true);
    return () => {
      // Pause first: releasing alone can let the looping sound run on for a moment.
      player.pause();
      player.remove();
      Vibration.cancel();
    };
  }, [ringing]);

  return {
    ringing,
    silence: () => setSeen(new Set(waitingOrderIds)),
    handled: (orderId: string) => setSeen((prev) => new Set(prev).add(orderId)),
  };
}
