import { logEvent, type AppEvent } from '@campuscart/core';

import { supabase } from '@/lib/supabase';

// Once per step and shop each time the app runs: the funnel report counts students, not taps.
const logged = new Set<string>();

/** Records a step towards ordering (opened the app, a shop, added to cart, opened checkout). */
export function logStep(name: AppEvent, shopId?: string) {
  const key = `${name}:${shopId ?? ''}`;
  if (logged.has(key)) return;
  logged.add(key);
  void logEvent(supabase, name, shopId);
}

/** Forgets what was logged, so the next person to sign in on this phone is counted too. */
export function resetLoggedSteps() {
  logged.clear();
}
