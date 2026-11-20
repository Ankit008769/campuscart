import { DEFAULT_FEE_RULES } from "@campuscart/core";

// The fee_rules keys place_order reads, with what each one means.
export const FEES = [
  { key: "delivery_fee", label: "Delivery fee on every delivery", fallback: DEFAULT_FEE_RULES.deliveryFeePaise },
  { key: "small_cart_limit", label: "Free delivery from", fallback: DEFAULT_FEE_RULES.smallCartLimitPaise },
  { key: "small_cart_fee", label: "Delivery fee below that", fallback: DEFAULT_FEE_RULES.smallCartFeePaise },
  { key: "platform_fee", label: "Platform fee", fallback: DEFAULT_FEE_RULES.platformFeePaise },
  { key: "night_surcharge", label: "Night delivery, 11 PM to 6 AM (extra)", fallback: 0 },
  // Not part of the bill: what a student rider earns per delivery (defaults to the delivery fee).
  { key: "rider_payout", label: "Rider earns per delivery", fallback: DEFAULT_FEE_RULES.deliveryFeePaise },
  // Not part of the bill: at this much cash from deliveries, a rider can't take more until shops confirm it.
  { key: "rider_cash_limit", label: "Most cash a rider may hold", fallback: 100000 },
] as const;
