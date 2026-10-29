// Delivers queued order notifications through Expo's push service.
//
// The database calls this (pg_net) right after an order changes, and once a minute as a backup.
// It reads the outbox with its own service key and claims each message once, so an outside call
// can at most make it deliver queued messages sooner.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { serviceKey, supabaseUrl } from '../_shared/keys.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Expo's limit per request. One request may only carry tokens of one Expo project, and the
// student and shop apps are separate projects, so each app is sent on its own.
const EXPO_BATCH = 100;
const APPS = ['consumer', 'merchant'] as const;

type Claimed = {
  outbox_id: number;
  app: (typeof APPS)[number];
  expo_token: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
};
type Ticket = { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };

Deno.serve(async () => {
  const db = createClient(supabaseUrl(), serviceKey(), { auth: { persistSession: false } });

  const { data, error } = await db.rpc('claim_push_batch', { p_limit: 500 });
  if (error) {
    console.error('claim_push_batch failed', error.message);
    return Response.json({ error: 'claim failed' }, { status: 500 });
  }
  const rows = (data ?? []) as Claimed[];

  let sent = 0;
  const dead: string[] = [];
  for (const app of APPS) {
    const forApp = rows.filter((row) => row.app === app);
    for (let i = 0; i < forApp.length; i += EXPO_BATCH) {
      const chunk = forApp.slice(i, i + EXPO_BATCH);
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(
          chunk.map((row) => ({
            to: row.expo_token,
            title: row.title,
            body: row.body,
            data: row.data,
            // Both apps create an "orders" channel at start-up; on Android the channel picks the
            // sound, and the shop app's channel rings with its bundled new-order alarm.
            channelId: 'orders',
            priority: 'high',
            sound: app === 'merchant' ? 'new_order.wav' : 'default',
          })),
        ),
      });
      if (!response.ok) {
        console.error('Expo push request failed', response.status, await response.text());
        continue;
      }
      const { data: tickets = [] } = (await response.json()) as { data?: Ticket[] };
      tickets.forEach((ticket, j) => {
        if (ticket.status === 'ok') sent++;
        else if (ticket.details?.error === 'DeviceNotRegistered') dead.push(chunk[j].expo_token);
        else console.error('Expo push ticket error', ticket.message);
      });
    }
  }

  if (dead.length > 0) {
    const { error: forgetError } = await db.rpc('forget_device_tokens', { p_tokens: dead });
    if (forgetError) console.error('forget_device_tokens failed', forgetError.message);
  }
  return Response.json({ claimed: rows.length, sent, forgotten: dead.length });
});
