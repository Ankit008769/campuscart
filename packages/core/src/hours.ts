import type { Json } from './database.types';

/**
 * Shop opening hours, stored in shops.hours as {"opens": "09:00", "closes": "23:00",
 * "closed_days": ["sun"]} in Indian time, or {} when the shop hasn't set any. Closing earlier than
 * opening means the shop runs past midnight. The database's within_shop_hours decides when to
 * switch a forgotten shop off; this file only reads, writes and describes the hours.
 */

export const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

export const WEEK_DAY_LABEL: Record<WeekDay, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

export type ShopHours = { opens: string; closes: string; closedDays: WeekDay[] };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(text: string): boolean {
  return TIME.test(text);
}

/** The hours in a shops.hours value, or null when none are set (or they are unreadable). */
export function parseShopHours(value: Json | null | undefined): ShopHours | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { opens, closes, closed_days: closedDays } = value;
  if (typeof opens !== 'string' || typeof closes !== 'string' || !isValidTime(opens) || !isValidTime(closes)) return null;
  const days = Array.isArray(closedDays)
    ? closedDays.filter((d): d is WeekDay => typeof d === 'string' && (WEEK_DAYS as readonly string[]).includes(d))
    : [];
  return { opens, closes, closedDays: days };
}

/** The shops.hours value for these hours; null clears them. */
export function shopHoursValue(hours: ShopHours | null): Json {
  if (!hours) return {};
  const closedDays = WEEK_DAYS.filter((d) => hours.closedDays.includes(d));
  return { opens: hours.opens, closes: hours.closes, closed_days: closedDays };
}

/** "09:30" → "9:30 AM", "12:00" → "12 PM", "00:00" → "12 AM". */
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "9 AM to 11 PM, closed Sun" for the shop screen. */
export function describeShopHours(hours: ShopHours): string {
  const window = hours.opens === hours.closes ? 'Open all day' : `${formatTime(hours.opens)} to ${formatTime(hours.closes)}`;
  if (hours.closedDays.length === 0) return window;
  const closed = WEEK_DAYS.filter((d) => hours.closedDays.includes(d)).map((d) => WEEK_DAY_LABEL[d]);
  return `${window}, closed ${closed.join(', ')}`;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_OF_WEEK: WeekDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Minutes since midnight and the weekday, in Indian time. */
function indianClock(at: Date): { minutes: number; day: WeekDay; yesterday: WeekDay } {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  const weekday = ist.getUTCDay();
  return {
    minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() + ist.getUTCSeconds() / 60,
    day: DAY_OF_WEEK[weekday],
    yesterday: DAY_OF_WEEK[(weekday + 6) % 7],
  };
}

const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/** Same rule as within_shop_hours in SQL (db-tests compare them). No hours means always within. */
export function isWithinShopHours(hours: ShopHours | null, at: Date): boolean {
  if (!hours) return true;
  const { minutes, day, yesterday } = indianClock(at);
  const opens = toMinutes(hours.opens);
  const closes = toMinutes(hours.closes);
  const closed = (d: WeekDay) => hours.closedDays.includes(d);
  if (opens === closes) return !closed(day);
  if (opens < closes) return minutes >= opens && minutes < closes && !closed(day);
  return (minutes >= opens && !closed(day)) || (minutes < closes && !closed(yesterday));
}
