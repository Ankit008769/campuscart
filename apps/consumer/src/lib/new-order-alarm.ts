import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useEffect, useState } from 'react';
import { Platform, Vibration } from 'react-native';

// A strong, repeating buzz so a new order is noticed at a busy counter.
const BUZZ = [0, 700, 300, 700, 300, 700];

/**
 * Rings and buzzes on a loop while a new order is waiting that nobody at the counter has seen.
 * Accepting or rejecting an order takes it off the waiting list; silence() marks every order
 * waiting right now as seen, so only a newer order rings again.
 */
export function useNewOrderAlarm(waitingOrderIds: readonly string[]) {
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const ringing = waitingOrderIds.some((id) => !seen.has(id));

  useEffect(() => {
    // Ring even with the phone on silent: an order nobody accepts expires in 3 minutes.
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
      player.remove();
      Vibration.cancel();
    };
  }, [ringing]);

  return { ringing, silence: () => setSeen(new Set(waitingOrderIds)) };
}
