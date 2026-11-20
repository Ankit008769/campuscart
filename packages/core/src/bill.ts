import type { OrderMode } from './orders';

/**
 * Fee rules shown in the cart. In production the admin-edited `fee_rules` table overrides the
 * defaults, and the database function `place_order` re-prices every order, so this is only a
 * preview. CampusCart's delivery is the small-cart fee: ₹50 on deliveries under ₹250, free from
 * there (the flat delivery fee is 0). Pickup never pays it. Screens show both as "Delivery".
 */
export type FeeRules = {
  deliveryFeePaise: number;
  smallCartLimitPaise: number;
  smallCartFeePaise: number;
  platformFeePaise: number;
  /** Added to deliveries between 11 PM and 6 AM (deliverySurcharge); not part of calculateBill. */
  nightSurchargePaise?: number;
};

export const DEFAULT_FEE_RULES: FeeRules = {
  deliveryFeePaise: 0,
  smallCartLimitPaise: 25000,
  smallCartFeePaise: 5000,
  platformFeePaise: 400,
};

/** What a bill charges for delivery, both parts together, as the screens show it. */
export const deliveryCharge = (bill: Pick<Bill, 'deliveryFeePaise' | 'smallCartFeePaise'>) =>
  bill.deliveryFeePaise + bill.smallCartFeePaise;

export type Bill = {
  subtotalPaise: number;
  deliveryFeePaise: number;
  smallCartFeePaise: number;
  platformFeePaise: number;
  totalPaise: number;
};

export function calculateBill(
  subtotalPaise: number,
  mode: OrderMode,
  rules: FeeRules = DEFAULT_FEE_RULES,
): Bill {
  const hasItems = subtotalPaise > 0;
  const delivering = hasItems && mode === 'delivery';
  const deliveryFeePaise = delivering ? rules.deliveryFeePaise : 0;
  const smallCartFeePaise =
    delivering && subtotalPaise < rules.smallCartLimitPaise ? rules.smallCartFeePaise : 0;
  const platformFeePaise = hasItems ? rules.platformFeePaise : 0;

  return {
    subtotalPaise,
    deliveryFeePaise,
    smallCartFeePaise,
    platformFeePaise,
    totalPaise: subtotalPaise + deliveryFeePaise + smallCartFeePaise + platformFeePaise,
  };
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Whether a delivery at `at` falls in the night window, 11 PM to 6 AM Indian time. */
export function isNightDelivery(at: Date): boolean {
  const hour = new Date(at.getTime() + IST_OFFSET_MS).getUTCHours();
  return hour >= 23 || hour < 6;
}

/**
 * What a delivery costs on top of calculateBill: the drop point's own extra fee (a far hostel) and
 * the night surcharge. Same rule as delivery_surcharge in SQL, which place_order charges.
 */
export function deliverySurcharge(input: {
  mode: 'delivery' | 'pickup';
  dropPointExtraPaise: number;
  at: Date;
  nightSurchargePaise: number;
}): number {
  if (input.mode === 'pickup') return 0;
  return input.dropPointExtraPaise + (isNightDelivery(input.at) ? input.nightSurchargePaise : 0);
}
