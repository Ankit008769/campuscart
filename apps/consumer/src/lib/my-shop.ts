import { supabase } from '@/lib/supabase';

export type MyShop = {
  id: string;
  name: string;
  is_open: boolean;
  prep_minutes: number;
  rush_until: string | null;
  rush_extra_minutes: number;
  /** owner sees staff and reports; counter runs orders and stock. */
  role: 'owner' | 'counter';
};

/** The shop this account works at, or null when an admin hasn't linked it to one. */
export async function loadMyShop(): Promise<MyShop | null> {
  const { data, error } = await supabase
    .from('shop_staff')
    .select('role, shops (id, name, is_open, prep_minutes, rush_until, rush_extra_minutes)')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.shops ? { ...data.shops, role: data.role } : null;
}
