import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A small on-phone copy of screens' data (Home, shop menus), so they draw at once on the next
 * launch and refresh in place. The copy is only a first paint: the database re-prices and
 * re-checks stock for every order. Off in Node (EAS evaluates routes there) and web SSR.
 */

const PREFIX = 'campuscart:cache:v1:';
const available = () => typeof window !== 'undefined';

export async function readCache<T>(key: string, maxAgeMs: number): Promise<T | null> {
  if (!available()) return null;
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const { at, value } = JSON.parse(raw) as { at: number; value: T };
    return Date.now() - at <= maxAgeMs ? value : null;
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown): void {
  if (!available()) return;
  AsyncStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value })).catch(() => {});
}
