import { ORDER_DETAIL, type CampusClient } from './api';
import type { Database } from './database.types';

/** Student riders: applying, going online, taking delivery offers, earnings and payouts. */

export type RiderStatus = Database['public']['Enums']['rider_status'];

export const RIDER_STATUS_LABEL: Record<RiderStatus, string> = {
  applied: 'Waiting for approval',
  approved: 'Approved',
  rejected: 'Not approved',
  suspended: 'Suspended',
};

/** This student's rider record, or null if they haven't applied. */
export async function getMyRider(client: CampusClient, userId: string) {
  const { data, error } = await client
    .from('riders')
    .select('status, upi_vpa, online, applied_at, admin_note')
    .eq('profile_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Applies to deliver (or updates the UPI ID payouts go to). Needs a phone number on the profile. */
export async function applyAsRider(client: CampusClient, upiVpa: string) {
  const { error } = await client.rpc('apply_as_rider', { p_upi_vpa: upiVpa });
  if (error) throw error;
}

export async function setRiderOnline(client: CampusClient, online: boolean) {
  const { error } = await client.rpc('set_rider_online', { p_online: online });
  if (error) throw error;
}

/** Open delivery orders an online rider can take, ready ones first. Empty when offline. */
export async function listDeliveryOffers(client: CampusClient) {
  const { data, error } = await client.rpc('list_delivery_offers');
  if (error) throw error;
  return data;
}

/** Takes an offer. Fails with a clear message if another rider was quicker. */
export async function claimDelivery(client: CampusClient, orderId: string) {
  const { error } = await client.rpc('claim_delivery', { p_order_id: orderId });
  if (error) throw error;
}

/** Gives a delivery back before pickup, so another rider can take it. */
export async function releaseDelivery(client: CampusClient, orderId: string) {
  const { error } = await client.rpc('release_delivery', { p_order_id: orderId });
  if (error) throw error;
}

// Kept as one literal so supabase-js can infer the row type.
const DELIVERY = `${ORDER_DETAIL}, rider_payout_paise, rider_assigned_at` as const;

/** The rider's deliveries from the last 8 weeks, newest first: open ones to work on, done ones for earnings. */
export async function listMyDeliveries(client: CampusClient, riderId: string) {
  const since = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from('orders')
    .select(DELIVERY)
    .eq('rider_id', riderId)
    .gte('placed_at', since)
    .order('placed_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function listMyPayouts(client: CampusClient) {
  const { data, error } = await client
    .from('rider_payouts')
    .select('id, week_start, deliveries, amount_paise, paid_at, reference')
    .order('week_start', { ascending: false });
  if (error) throw error;
  return data;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The Monday (yyyy-mm-dd, Indian time) of the payout week a moment falls in. */
export function payoutWeekOf(at: Date | string): string {
  const ist = new Date(new Date(at).getTime() + IST_OFFSET_MS);
  const daysSinceMonday = (ist.getUTCDay() + 6) % 7;
  ist.setUTCDate(ist.getUTCDate() - daysSinceMonday);
  return ist.toISOString().slice(0, 10);
}

/** Delivered orders and earnings per payout week, newest week first. */
export function earningsByWeek(deliveries: { status: string; completed_at: string | null; rider_payout_paise: number }[]) {
  const weeks = new Map<string, { weekStart: string; deliveries: number; paise: number }>();
  for (const d of deliveries) {
    if (d.status !== 'delivered' || !d.completed_at) continue;
    const weekStart = payoutWeekOf(d.completed_at);
    const week = weeks.get(weekStart) ?? { weekStart, deliveries: 0, paise: 0 };
    week.deliveries += 1;
    week.paise += d.rider_payout_paise;
    weeks.set(weekStart, week);
  }
  return [...weeks.values()].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

// --- admin ---------------------------------------------------------------------------------------

/** Every rider application with the student's contact details, newest first. */
export async function listRiders(client: CampusClient) {
  const { data, error } = await client
    .from('riders')
    .select('profile_id, status, upi_vpa, online, applied_at, decided_at, admin_note, profiles (name, email, phone)')
    .order('applied_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function decideRider(client: CampusClient, profileId: string, status: RiderStatus, note?: string) {
  const { error } = await client.rpc('decide_rider', { p_profile_id: profileId, p_status: status, p_note: note });
  if (error) throw error;
}

/** Makes one payout per rider for a finished week (its Monday, yyyy-mm-dd). Returns how many. */
export async function prepareRiderPayouts(client: CampusClient, weekStart: string): Promise<number> {
  const { data, error } = await client.rpc('prepare_rider_payouts', { p_week_start: weekStart });
  if (error) throw error;
  return data;
}

/** All payouts with the rider's name, unpaid first. */
export async function listRiderPayouts(client: CampusClient) {
  const { data, error } = await client
    .from('rider_payouts')
    .select('id, rider_id, week_start, deliveries, amount_paise, paid_at, reference, profiles (name)')
    .order('paid_at', { ascending: true, nullsFirst: true })
    .order('week_start', { ascending: false });
  if (error) throw error;
  return data;
}

export async function markPayoutPaid(client: CampusClient, payoutId: string, reference: string) {
  const { error } = await client.rpc('mark_payout_paid', { p_payout_id: payoutId, p_reference: reference });
  if (error) throw error;
}

/** Drop points with 2 or more open orders, offered as one trip. */
export async function listBatchOffers(client: CampusClient) {
  const { data, error } = await client.rpc('list_batch_offers');
  if (error) throw error;
  return data;
}

/** Takes every order of a batch still free. Returns how many the rider got. */
export async function claimBatch(client: CampusClient, dropPointId: string, orderIds: string[]): Promise<number> {
  const { data, error } = await client.rpc('claim_batch', { p_drop_point_id: dropPointId, p_order_ids: orderIds });
  if (error) throw error;
  return data;
}

// --- cash collected on deliveries ----------------------------------------------------------------

/**
 * Cash this rider collected and hasn't handed to the shops yet, per shop, oldest first. Each row
 * also carries the limit: at it, the rider can't take more deliveries until a shop confirms.
 */
export async function getMyRiderCash(client: CampusClient) {
  const { data, error } = await client.rpc('my_rider_cash');
  if (error) throw error;
  return data;
}

/** Riders holding this shop's cash, with their phone numbers. Shop staff and admins only. */
export async function listShopRiderCash(client: CampusClient, shopId: string) {
  const { data, error } = await client.rpc('shop_rider_cash', { p_shop_id: shopId });
  if (error) throw error;
  return data;
}

/** The shop confirms it received everything a rider held for it. Returns the amount in paise. */
export async function settleRiderCash(client: CampusClient, shopId: string, riderId: string): Promise<number> {
  const { data, error } = await client.rpc('settle_rider_cash', { p_shop_id: shopId, p_rider_id: riderId });
  if (error) throw error;
  return data;
}

/** Admins: every rider holding cash, per shop, oldest first. */
export async function getRiderCashReport(client: CampusClient) {
  const { data, error } = await client.rpc('rider_cash_report');
  if (error) throw error;
  return data;
}
