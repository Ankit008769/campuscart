import { useEffect, useRef, useState } from 'react';

/**
 * Rings on a loop while a new order is waiting that nobody has seen, like the shop app's in-app
 * ring, and shows a browser notification so a shop in another tab notices too. Browsers only play
 * sound after someone has clicked on the page, so `blocked` asks for one click to turn it on.
 */
export function useOrderAlarm(waitingOrderIds: readonly string[]) {
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const [blocked, setBlocked] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const notified = useRef<Set<string>>(new Set());
  const ringing = waitingOrderIds.some((id) => !seen.has(id));

  useEffect(() => {
    audio.current = new Audio('/sounds/new_order.wav');
    audio.current.loop = true;
    return () => audio.current?.pause();
  }, []);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    if (!ringing) {
      a.pause();
      a.currentTime = 0;
      return;
    }
    a.play().then(
      () => setBlocked(false),
      () => setBlocked(true),
    );
  }, [ringing]);

  // A browser notification per new order, while the page is open but maybe not in front.
  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    for (const id of waitingOrderIds) {
      if (notified.current.has(id)) continue;
      notified.current.add(id);
      if (document.visibilityState === 'visible' && document.hasFocus()) continue;
      new Notification('New order on Campus Cart', { body: 'Accept or reject it on the Orders page.', tag: id, requireInteraction: true });
    }
  }, [waitingOrderIds]);

  return {
    ringing,
    /** The browser refused to play sound until someone clicks: show a button that calls enable(). */
    blocked,
    enable: () => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
      audio.current?.play().then(
        () => {
          setBlocked(false);
          if (!ringing) audio.current?.pause();
        },
        () => setBlocked(true),
      );
    },
    silence: () => setSeen(new Set(waitingOrderIds)),
    handled: (orderId: string) => setSeen((prev) => new Set(prev).add(orderId)),
  };
}
