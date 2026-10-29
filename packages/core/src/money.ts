/**
 * All money in CampusCart is stored as integer paise (₹1 = 100 paise),
 * so totals never pick up floating-point errors.
 */

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Formats paise as rupees with Indian digit grouping: 123456789 → "₹12,34,567.89". */
export function formatPaise(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(Math.round(paise));
  const rupees = String(Math.floor(abs / 100));
  const rest = abs % 100;

  const lastThree = rupees.slice(-3);
  const leading = rupees.slice(0, -3);
  const grouped = leading
    ? `${leading.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}`
    : lastThree;

  return rest === 0
    ? `${sign}₹${grouped}`
    : `${sign}₹${grouped}.${String(rest).padStart(2, '0')}`;
}

/**
 * Parses what someone typed as a rupee amount ("12", "12.5", "₹1,250.00") into paise, or null if
 * it isn't one. Works on the digits as text, so "0.29" is 29 paise exactly.
 */
export function parseRupees(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, '');
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}
