import type { CampusClient } from './api';
import { formatPaise } from './money';

/** Shop app extras: rush mode for everyone at the counter; staff and reports for the owner. */

const MINUTE = 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * MINUTE;

/** Whether a shop is in rush mode at `now`. */
export function isRushing(shop: { rush_until: string | null }, now = new Date()): boolean {
  return !!shop.rush_until && Date.parse(shop.rush_until) > now.getTime();
}

/** The wait students see: prep time, plus the rush extra while rush mode is on. */
export function effectivePrepMinutes(
  shop: { prep_minutes: number; rush_until: string | null; rush_extra_minutes: number },
  now = new Date(),
): number {
  return shop.prep_minutes + (isRushing(shop, now) ? shop.rush_extra_minutes : 0);
}

/** Turns rush mode on for `minutes`, or off with null. Any staff member may. */
export async function setRush(client: CampusClient, shopId: string, minutes: number | null) {
  const rushUntil = minutes ? new Date(Date.now() + minutes * MINUTE).toISOString() : null;
  const { error } = await client.from('shops').update({ rush_until: rushUntil }).eq('id', shopId);
  if (error) throw error;
}

/** The shop's staff with names, for the owner (row-level security shows a counter only themself). */
export async function listShopStaff(client: CampusClient, shopId: string) {
  const { data, error } = await client
    .from('shop_staff')
    .select('profile_id, role, profiles (name, email)')
    .eq('shop_id', shopId)
    .order('role');
  if (error) throw error;
  return data;
}

/** Adds a counter worker by Gmail. Returns 'added' if they already had an account, else 'invited'. */
export async function inviteShopStaff(client: CampusClient, shopId: string, email: string): Promise<string> {
  const { data, error } = await client.rpc('invite_shop_staff', { p_shop_id: shopId, p_email: email });
  if (error) throw error;
  return data;
}

export async function removeShopStaff(client: CampusClient, shopId: string, profileId: string) {
  const { error } = await client.rpc('remove_shop_staff', { p_shop_id: shopId, p_profile_id: profileId });
  if (error) throw error;
}

export type ReportPeriod = { key: string; label: string; from: Date; to: Date };

/** This and last week (Monday to Sunday) and this and last month, in Indian time. */
export function reportPeriods(now = new Date()): ReportPeriod[] {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  // Midnight Indian time, as a real instant, for a calendar date given in IST parts.
  const midnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate();
  const monday = d - ((ist.getUTCDay() + 6) % 7);
  return [
    { key: 'this-week', label: 'This week', from: midnight(y, m, monday), to: midnight(y, m, monday + 7) },
    { key: 'last-week', label: 'Last week', from: midnight(y, m, monday - 7), to: midnight(y, m, monday) },
    { key: 'this-month', label: 'This month', from: midnight(y, m, 1), to: midnight(y, m + 1, 1) },
    { key: 'last-month', label: 'Last month', from: midnight(y, m - 1, 1), to: midnight(y, m, 1) },
  ];
}

export async function shopReport(client: CampusClient, shopId: string, period: ReportPeriod) {
  const { data, error } = await client.rpc('shop_report', {
    p_shop_id: shopId,
    p_from: period.from.toISOString(),
    p_to: period.to.toISOString(),
  });
  if (error) throw error;
  return data;
}

export async function shopTopItems(client: CampusClient, shopId: string, period: ReportPeriod) {
  const { data, error } = await client.rpc('shop_top_items', {
    p_shop_id: shopId,
    p_from: period.from.toISOString(),
    p_to: period.to.toISOString(),
  });
  if (error) throw error;
  return data;
}

type ReportDay = {
  day: string;
  orders: number;
  completed: number;
  dropped: number;
  sales_paise: number;
  commission_paise: number;
};

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The report as CSV for a spreadsheet: one row per day, then totals. Money in rupees. */
export function reportCsv(days: ReportDay[]): string {
  const rupees = (paise: number) => (paise / 100).toFixed(2);
  const rows: (string | number)[][] = [
    ['Date', 'Orders', 'Completed', 'Rejected or cancelled', 'Sales (₹)', 'Commission (₹)', 'Net (₹)'],
  ];
  for (const d of days) {
    rows.push([
      d.day,
      d.orders,
      d.completed,
      d.dropped,
      rupees(d.sales_paise),
      rupees(d.commission_paise),
      rupees(d.sales_paise - d.commission_paise),
    ]);
  }
  const sum = (pick: (d: ReportDay) => number) => days.reduce((total, d) => total + pick(d), 0);
  const sales = sum((d) => d.sales_paise);
  const commission = sum((d) => d.commission_paise);
  rows.push([
    'Total',
    sum((d) => d.orders),
    sum((d) => d.completed),
    sum((d) => d.dropped),
    rupees(sales),
    rupees(commission),
    rupees(sales - commission),
  ]);
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

/** "₹1,234 from 12 completed orders" for the report header. */
export function reportSummary(days: ReportDay[]): string {
  const sales = days.reduce((t, d) => t + d.sales_paise, 0);
  const completed = days.reduce((t, d) => t + d.completed, 0);
  return `${formatPaise(sales)} from ${completed} completed ${completed === 1 ? 'order' : 'orders'}`;
}
