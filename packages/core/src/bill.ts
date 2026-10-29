import type { OrderMode } from './orders';

/**
 * Fee rules shown in the cart. The defaults come from the roadmap's revenue model;
 * in production the admin-edited `fee_rules` table overrides them, and the database
 * function `place_order` re-prices every order, so this is only a preview.
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
  deliveryFeePaise: 1500,
  smallCartLimitPaise: 9900,
  smallCartFeePaise: 1000,
  platformFeePaise: 400,
};

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
