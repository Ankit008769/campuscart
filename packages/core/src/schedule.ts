import { formatTime, isWithinShopHours, type ShopHours } from './hours';

/**
 * Scheduled orders. A student picks a slot; the shop gets the order at the slot time minus its
 * prep time and the walk to the drop point, so it arrives around the slot. The database function
 * schedule_problem applies the same rules (db-tests compare them); this copy fills the slot picker.
 */

export const SLOT_MINUTES = 15;
/** The shop gets a scheduled order at least this many minutes after it is placed. */
export const SCHEDULE_LEAD_MINUTES = 10;
export const SCHEDULE_DAYS = 2;
/** Walk time when a shop has none measured for a drop point (walk_times). */
export const DEFAULT_WALK_MINUTES = 10;

const MINUTE = 60 * 1000;

/** When the shop gets an order due at `slot`. */
export function releaseTime(slot: Date, prepMinutes: number, walkMinutes: number): Date {
  return new Date(slot.getTime() - (prepMinutes + walkMinutes) * MINUTE);
}

/** Why a slot can't be booked, or null if it can. */
export function slotProblem(args: {
  slot: Date;
  now: Date;
  prepMinutes: number;
  walkMinutes: number;
  hours: ShopHours | null;
}): string | null {
  const { slot, now, prepMinutes, walkMinutes, hours } = args;
  if (slot.getUTCSeconds() !== 0 || slot.getUTCMilliseconds() !== 0 || slot.getUTCMinutes() % SLOT_MINUTES !== 0) {
    return 'Pick one of the listed times';
  }
  const release = releaseTime(slot, prepMinutes, walkMinutes);
  if (release.getTime() < now.getTime() + SCHEDULE_LEAD_MINUTES * MINUTE) return 'That time is too soon. Order now instead';
  if (slot.getTime() > now.getTime() + SCHEDULE_DAYS * 24 * 60 * MINUTE) return 'You can schedule up to 2 days ahead';
  if (!isWithinShopHours(hours, release)) return 'The shop is closed at that time';
  return null;
}

/** Every bookable slot in the next 2 days, earliest first. */
export function scheduleSlots(args: { now: Date; prepMinutes: number; walkMinutes: number; hours: ShopHours | null }): Date[] {
  const step = SLOT_MINUTES * MINUTE;
  const slots: Date[] = [];
  const first = Math.ceil(args.now.getTime() / step) * step;
  const last = args.now.getTime() + SCHEDULE_DAYS * 24 * 60 * MINUTE;
  for (let t = first; t <= last; t += step) {
    const slot = new Date(t);
    if (slotProblem({ ...args, slot }) === null) slots.push(slot);
  }
  return slots;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The calendar day (yyyy-mm-dd) of a moment in Indian time. */
export function indianDay(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** "Today" / "Tomorrow" / "Sat 31 Oct" and "6:30 PM", in Indian time whatever the phone's time zone. */
export function slotLabel(slot: Date, now: Date): { day: string; time: string } {
  const ist = new Date(slot.getTime() + IST_OFFSET_MS);
  const days = Math.round((Date.parse(indianDay(slot)) - Date.parse(indianDay(now))) / (24 * 60 * MINUTE));
  const day =
    days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${WEEKDAY[ist.getUTCDay()]} ${ist.getUTCDate()} ${MONTH[ist.getUTCMonth()]}`;
  const time = formatTime(`${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`);
  return { day, time };
}
