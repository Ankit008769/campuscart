/**
 * Paying at handover. UPI always goes to the shop's own UPI ID, never to a rider, so the student's
 * order screen links straight to it. Cash a rider collects is the shop's until the shop confirms it
 * received it (rider_cash in the database).
 */

const UPI_VPA = /^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,63}$/;

/** True for a UPI ID such as "shop@okaxis". The same check the database uses for riders. */
export function isUpiVpa(value: string): boolean {
  return UPI_VPA.test(value.trim());
}

/**
 * A upi://pay link that opens the phone's UPI app with the payee, amount and a note filled in.
 * Some apps refuse links to personal (non-merchant) UPI IDs, so screens also show the ID itself.
 */
export function upiPayUrl(args: { vpa: string; payee: string; amountPaise: number; note: string }): string {
  if (!isUpiVpa(args.vpa)) throw new Error('Not a UPI ID');
  if (!Number.isInteger(args.amountPaise) || args.amountPaise <= 0) throw new Error('Amount must be positive paise');
  const params = new URLSearchParams({
    pa: args.vpa.trim(),
    pn: args.payee,
    am: (args.amountPaise / 100).toFixed(2),
    cu: 'INR',
    tn: args.note,
  });
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}
