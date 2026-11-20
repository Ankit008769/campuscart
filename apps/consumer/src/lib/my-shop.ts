import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

export type MyShop = {
  id: string;
  name: string;
  is_open: boolean;
  prep_minutes: number;
  rush_until: string | null;
  rush_extra_minutes: number;
  /** Where students pay by UPI. Only the CampusCart team can change it. */
  upi_vpa: string | null;
  /** owner sees staff and reports; counter runs orders and stock. */
  role: 'owner' | 'counter';
};

// One login can run several outlets of the same owner (Booth 4, SAC and Nescafé take their orders on
// one phone). The Shop and Catalog tabs work on one outlet at a time; this remembers which.
const OUTLET_KEY = 'campuscart:outlet';

/** Every outlet this account works at, by name; empty when an admin hasn't linked it to one. */
export async function loadMyShops(): Promise<MyShop[]> {
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) return [];
  // Owners can also read their staff's rows, so ask for this account's own.
  const { data, error } = await supabase
    .from('shop_staff')
    .select('role, shops (id, name, is_open, prep_minutes, rush_until, rush_extra_minutes, upi_vpa)')
    .eq('profile_id', userId);
  if (error) throw error;
  return data.flatMap((row) => (row.shops ? [{ ...row.shops, role: row.role }] : [])).sort((a, b) => a.name.localeCompare(b.name));
}

/** The outlet picked on the Shop or Catalog tab (the first one until then), or null when there is none. */
export async function loadMyShop(): Promise<MyShop | null> {
  const [shops, chosen] = await Promise.all([loadMyShops(), AsyncStorage.getItem(OUTLET_KEY).catch(() => null)]);
  return shops.find((s) => s.id === chosen) ?? shops[0] ?? null;
}

/** Remembers the outlet the Shop and Catalog tabs (and the item editor and scanner) work on. */
export async function chooseOutlet(shopId: string): Promise<void> {
  await AsyncStorage.setItem(OUTLET_KEY, shopId).catch(() => {});
}
