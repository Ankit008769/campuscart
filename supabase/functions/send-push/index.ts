// Delivers queued order notifications through Expo's push service.
//
// The database calls this (pg_net) right after an order changes, and once a minute as a backup.
// It reads the outbox with its own service key and claims each message once, so an outside call
// can at most make it deliver queued messages sooner.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { serviceKey, supabaseUrl } from '../_shared/keys.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Expo's limit per request.
const EXPO_BATCH = 100;

type Claimed = {
  outbox_id: number;
  // Which side of the app the message is for: 'consumer' (students) or 'merchant' (shops).
  app: 'consumer' | 'merchant';
  expo_token: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
};
type Ticket = { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };
type PushResponse = { data?: Ticket[]; errors?: { code?: string; details?: Record<string, string[]> }[] };

/**
 * Sends one request and pairs each ticket with its row. Expo refuses a request whose tokens belong
 * to more than one Expo project and lists each project's tokens; a shop phone may still hold a token
 * from the retired CampusCart Partner app (its own project), so such a request is sent again per project.
 */
async function send(chunk: Claimed[]): Promise<{ row: Claimed; ticket: Ticket }[]> {
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(
      chunk.map((row) => ({
        to: row.expo_token,
        title: row.title,
        body: row.body,
        data: row.data,
        // The app creates one Android channel per side at start-up, and on Android the channel picks
        // the sound: shops ring with the bundled new-order alarm. See apps/consumer/src/lib/push.ts.
        channelId: row.app === 'merchant' ? 'new-orders' : 'orders',
        priority: 'high',
        sound: row.app === 'merchant' ? 'new_order.wav' : 'default',
      })),
    ),
  });
  const result = (await response.json().catch(() => null)) as PushResponse | null;

  const byProject = result?.errors?.find((e) => e.code === 'PUSH_TOO_MANY_EXPERIENCE_IDS')?.details;
  if (byProject) {
    const groups = Object.values(byProject)
      .map((tokens) => chunk.filter((row) => tokens.includes(row.expo_token)))
      .filter((group) => group.length > 0 && group.length < chunk.length);
    const sent = [];
    for (const group of groups) sent.push(...(await send(group)));
    return sent;
  }
  if (!response.ok || !result?.data) {
    console.error('Expo push request failed', response.status, JSON.stringify(result));
    return [];
  }
  return result.data.map((ticket, j) => ({ row: chunk[j], ticket }));
}

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
  for (let i = 0; i < rows.length; i += EXPO_BATCH) {
    for (const { row, ticket } of await send(rows.slice(i, i + EXPO_BATCH))) {
      if (ticket.status === 'ok') sent++;
      else if (ticket.details?.error === 'DeviceNotRegistered') dead.push(row.expo_token);
      else console.error('Expo push ticket error', ticket.message);
    }
  }

  if (dead.length > 0) {
    const { error: forgetError } = await db.rpc('forget_device_tokens', { p_tokens: dead });
    if (forgetError) console.error('forget_device_tokens failed', forgetError.message);
  }
  return Response.json({ claimed: rows.length, sent, forgotten: dead.length });
});
