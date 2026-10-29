/** Indian mobile number as +91XXXXXXXXXX, or null when it isn't a valid 10-digit mobile. */
export function normalizeIndianMobile(input: string): string | null {
  const digits = input.replace(/\D/g, '').replace(/^(?:91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}
