// Firebase Cloud Messaging (HTTP v1), for Android phones that registered a Firebase token. Free, with
// no Firebase billing plan needed. The service account comes from the FCM_SERVICE_ACCOUNT secret
// (the JSON key file from Firebase → Project settings → Service accounts).

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

export type FcmMessage = {
  token: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  channelId: string;
};

/**
 * A shop's new order (and its reminder) rings like a call on 1.0.5 and later, until ringUntil
 * (apps/consumer/plugins/order-ringer). Firebase data values must be strings.
 */
function ringFields(data: Record<string, unknown>): Record<string, string> {
  if (data.ring !== true || typeof data.orderId !== 'string') return {};
  return { ring: '1', orderId: data.orderId, ringUntil: String(data.ringUntil ?? '') };
}

/** What happened to one message: sent, a token Firebase no longer knows, or another failure. */
export type FcmResult = 'sent' | 'unregistered' | 'failed';

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encodeJson = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));

function readServiceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) return null;
  try {
    const account = JSON.parse(raw) as ServiceAccount;
    return account.project_id && account.client_email && account.private_key ? account : null;
  } catch {
    return null;
  }
}

/** A short-lived Google access token for sending, from a JWT the service account signs. */
async function accessToken(account: ServiceAccount): Promise<string> {
  const der = Uint8Array.from(
    atob(account.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')),
    (c) => c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encodeJson({ alg: 'RS256', typ: 'JWT' })}.${encodeJson({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64url(signature)}`,
    }),
  });
  const result = (await response.json().catch(() => null)) as { access_token?: string; error?: string } | null;
  if (!response.ok || !result?.access_token) throw new Error(`Google token request failed: ${response.status} ${result?.error ?? ''}`);
  return result.access_token;
}

/**
 * Sends each message as a data message in the shape expo-notifications shows on Android: title and
 * message to display, the channel (which picks the sound), and the tap data as a JSON string in body.
 * Returns null when no service account is set, so the caller can leave these rows unsent.
 */
export async function sendFcm(messages: FcmMessage[]): Promise<FcmResult[] | null> {
  const account = readServiceAccount();
  if (!account) return null;
  const token = await accessToken(account);
  const url = `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`;

  const sendOne = async (m: FcmMessage): Promise<FcmResult> => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: m.token,
          android: { priority: 'HIGH' },
          data: { title: m.title, message: m.body, channelId: m.channelId, body: JSON.stringify(m.data), ...ringFields(m.data) },
        },
      }),
    });
    if (response.ok) return 'sent';
    const error = (await response.json().catch(() => null)) as {
      error?: { status?: string; details?: { errorCode?: string }[] };
    } | null;
    const code = error?.error?.details?.find((d) => d.errorCode)?.errorCode ?? error?.error?.status;
    if (code === 'UNREGISTERED' || (response.status === 400 && code === 'INVALID_ARGUMENT')) return 'unregistered';
    console.error('FCM send failed', response.status, code);
    return 'failed';
  };

  // A few at a time keeps a busy minute well inside Firebase's rate limits.
  const results: FcmResult[] = [];
  for (let i = 0; i < messages.length; i += 10) {
    results.push(...(await Promise.all(messages.slice(i, i + 10).map(sendOne))));
  }
  return results;
}
