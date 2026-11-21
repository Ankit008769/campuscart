// Gives out, resets and takes away the IDs shops sign in with. Creating auth accounts and setting
// passwords needs the service key, so the app can't do it itself.
//
// Admins (past the Authenticator step) manage any shop's IDs and owners manage their counter staff:
// can_manage_shop_logins decides, run with the caller's own session. Passwords pass through here to
// Supabase Auth, which stores only a hash, and are never logged.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { publishableKey, serviceKey, supabaseUrl } from '../_shared/keys.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

// Same rules as packages/core/src/logins.ts.
const LOGIN_DOMAIN = 'logins.campuscart.invalid';
const LOGIN_ID = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const MIN_PASSWORD = 8;
const FOREVER = '876000h';

type Body = {
  action?: unknown;
  shopId?: unknown;
  profileId?: unknown;
  loginId?: unknown;
  password?: unknown;
  name?: unknown;
  staffRole?: unknown;
};

const passwordProblem = (password: unknown) =>
  typeof password === 'string' && password.length >= MIN_PASSWORD ? null : `Use a password of at least ${MIN_PASSWORD} characters.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authorization = req.headers.get('Authorization');
  if (!authorization) return reply({ error: 'Sign in first' }, 401);
  const asCaller = createClient(supabaseUrl(), publishableKey(), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: auth } = await asCaller.auth.getUser();
  if (!auth.user) return reply({ error: 'Sign in first' }, 401);

  const body = (await req.json().catch(() => ({}))) as Body;
  const { action, shopId } = body;
  if (typeof shopId !== 'string') return reply({ error: 'Which shop?' }, 400);

  const admin = createClient(supabaseUrl(), serviceKey(), { auth: { persistSession: false } });
  const mayManage = async (staffRole: string) => {
    const { data, error } = await asCaller.rpc('can_manage_shop_logins', { p_shop_id: shopId, p_staff_role: staffRole });
    return !error && data === true;
  };
  const notAllowed = () => reply({ error: 'You can’t change logins for this shop.' }, 403);

  if (action === 'create') {
    const { password, staffRole } = body;
    const loginId = typeof body.loginId === 'string' ? body.loginId.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (staffRole !== 'owner' && staffRole !== 'counter') return reply({ error: 'Owner or counter?' }, 400);
    if (!(await mayManage(staffRole))) return notAllowed();
    if (!LOGIN_ID.test(loginId)) {
      return reply({ error: 'Use 3 to 30 small letters, numbers, dots, dashes or underscores for the ID.' }, 400);
    }
    const problem = passwordProblem(password);
    if (problem) return reply({ error: problem }, 400);

    const { data, error } = await admin.auth.admin.createUser({
      email: `${loginId}@${LOGIN_DOMAIN}`,
      password: password as string,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (error?.code === 'email_exists') return reply({ error: 'That ID is taken. Pick another.' }, 409);
    if (error || !data.user) {
      console.error('createUser failed', error?.message);
      return reply({ error: 'Could not create the login. Try again.' }, 500);
    }
    const { error: attachError } = await admin.rpc('attach_shop_login', {
      p_profile_id: data.user.id,
      p_shop_id: shopId,
      p_staff_role: staffRole,
    });
    if (attachError) {
      console.error('attach_shop_login failed', attachError.message);
      await admin.auth.admin.deleteUser(data.user.id);
      return reply({ error: 'Could not add the login to this shop. Try again.' }, 500);
    }
    return reply({ profileId: data.user.id, loginId });
  }

  // Admins only: puts an ID that already exists at another outlet of the same owner, so one login
  // takes the orders of several outlets. The ID keeps its password and its other outlets.
  if (action === 'link') {
    const { staffRole } = body;
    const loginId = typeof body.loginId === 'string' ? body.loginId.trim().toLowerCase() : '';
    if (staffRole !== 'owner' && staffRole !== 'counter') return reply({ error: 'Owner or counter?' }, 400);
    const { data: isAdmin } = await asCaller.rpc('is_admin');
    if (isAdmin !== true) return notAllowed();
    if (!LOGIN_ID.test(loginId)) return reply({ error: 'That isn’t an ID.' }, 400);
    const { data: person } = await admin
      .from('profiles')
      .select('id, role, blocked')
      .eq('email', `${loginId}@${LOGIN_DOMAIN}`)
      .maybeSingle();
    if (!person || person.blocked || (person.role !== 'merchant_owner' && person.role !== 'merchant_staff')) {
      return reply({ error: 'No working shop ID called that. Check the spelling, or add a new login instead.' }, 404);
    }
    const { error } = await admin
      .from('shop_staff')
      .upsert({ shop_id: shopId, profile_id: person.id, role: staffRole }, { onConflict: 'shop_id,profile_id' });
    if (error) {
      console.error('Linking staff failed', error.message);
      return reply({ error: 'Could not add the ID to this shop. Try again.' }, 500);
    }
    if (staffRole === 'owner' && person.role !== 'merchant_owner') {
      await admin.from('profiles').update({ role: 'merchant_owner' }).eq('id', person.id);
    }
    return reply({ profileId: person.id, loginId });
  }

  // Resetting and removing act on someone already at this shop.
  const { profileId } = body;
  if (typeof profileId !== 'string') return reply({ error: 'Which login?' }, 400);
  const { data: member } = await admin
    .from('shop_staff')
    .select('role, profiles (email)')
    .eq('shop_id', shopId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (!member) return reply({ error: 'That login isn’t at this shop.' }, 404);
  if (!(await mayManage(member.role))) return notAllowed();
  const hasPassword = (member.profiles?.email ?? '').endsWith(`@${LOGIN_DOMAIN}`);

  if (action === 'reset') {
    if (!hasPassword) return reply({ error: 'This person signs in with Google. Give them a new ID instead.' }, 400);
    // A login that runs several outlets: the caller must be allowed to manage it at each of them.
    const { data: memberships } = await admin.from('shop_staff').select('shop_id, role').eq('profile_id', profileId);
    for (const m of memberships ?? []) {
      const { data: ok } = await asCaller.rpc('can_manage_shop_logins', { p_shop_id: m.shop_id, p_staff_role: m.role });
      if (ok !== true) return notAllowed();
    }
    const problem = passwordProblem(body.password);
    if (problem) return reply({ error: problem }, 400);
    const { error } = await admin.auth.admin.updateUserById(profileId, { password: body.password as string });
    if (error) {
      console.error('updateUserById failed', error.message);
      return reply({ error: 'Could not change the password. Try again.' }, 500);
    }
    return reply({ ok: true });
  }

  if (action === 'remove') {
    const { error } = await admin.from('shop_staff').delete().eq('shop_id', shopId).eq('profile_id', profileId);
    if (error) {
      console.error('Removing staff failed', error.message);
      return reply({ error: 'Could not remove the login. Try again.' }, 500);
    }
    // Still at another outlet (one owner's login can run several): it keeps working there.
    const { count } = await admin.from('shop_staff').select('shop_id', { count: 'exact', head: true }).eq('profile_id', profileId);
    if ((count ?? 0) > 0) return reply({ ok: true });
    // An ID exists only for its shops, so once it is at none it is locked for good. A Google account
    // is a person's own, and goes back to being an ordinary account.
    if (hasPassword) {
      await admin.from('profiles').update({ blocked: true }).eq('id', profileId);
      await admin.auth.admin.updateUserById(profileId, { ban_duration: FOREVER });
    } else {
      await admin.from('profiles').update({ role: 'student' }).eq('id', profileId);
    }
    return reply({ ok: true });
  }

  return reply({ error: 'Unknown action' }, 400);
});
