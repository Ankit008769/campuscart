import assert from 'node:assert/strict';
import { test } from 'node:test';

import { completeSignInFromUrl, parseAuthRedirect } from './auth.ts';

function fakeClient(error: Error | null = null) {
  const codes: string[] = [];
  const client = {
    auth: {
      exchangeCodeForSession: async (code: string) => {
        codes.push(code);
        return { data: {}, error };
      },
    },
  } as never;
  return { client, codes };
}

test('reads the PKCE code from the return link', () => {
  assert.deepEqual(parseAuthRedirect('campuscart://?code=abc-123'), { code: 'abc-123' });
  assert.deepEqual(parseAuthRedirect('campuscart-partner://auth?code=xyz&state=1'), { code: 'xyz' });
});

test('reads a refusal from the query or the fragment, decoded', () => {
  assert.deepEqual(
    parseAuthRedirect('campuscart://?error=access_denied&error_description=Sign+in+with+your+%40nith.ac.in+college+account.'),
    { error: 'Sign in with your @nith.ac.in college account.' },
  );
  assert.deepEqual(parseAuthRedirect('campuscart://#error=server_error'), { error: 'server_error' });
});

test('returns null when the link carries neither a code nor an error', () => {
  assert.equal(parseAuthRedirect('campuscart://'), null);
});

test('exchanges a code once even when Android delivers the return link twice', async () => {
  const { client, codes } = fakeClient();
  const results = await Promise.all([
    completeSignInFromUrl(client, 'campuscart://?code=twice-1'),
    completeSignInFromUrl(client, 'campuscart://?code=twice-1'),
  ]);
  assert.deepEqual(results, [true, true]);
  assert.deepEqual(codes, ['twice-1']);
});

test('ignores links that are not sign-in returns', async () => {
  const { client, codes } = fakeClient();
  assert.equal(await completeSignInFromUrl(client, 'campuscart://orders'), false);
  assert.deepEqual(codes, []);
});

test('surfaces refusals and failed exchanges as errors', async () => {
  const { client } = fakeClient();
  await assert.rejects(
    completeSignInFromUrl(client, 'campuscart://?error=access_denied&error_description=Sign+in+with+your+%40nith.ac.in+college+account.'),
    /Sign in with your @nith.ac.in college account./,
  );
  const failing = fakeClient(new Error('invalid flow state'));
  await assert.rejects(completeSignInFromUrl(failing.client, 'campuscart://?code=stale-1'), /invalid flow state/);
});
