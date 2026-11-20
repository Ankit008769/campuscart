import { formatPaise, removeOrderItems } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Item = { id: string; qty: number; name_snapshot: string; price_paise_snapshot?: number };

/**
 * The items on a shop's order. Until it is packed, staff can tick the ones they don't have and take
 * them off: the student keeps the rest at a lower price and gets a push saying so, instead of the
 * whole order being rejected.
 */
export function OrderItemsEditor({
  orderId,
  status,
  items,
  onError,
}: {
  orderId: string;
  status: string;
  items: Item[];
  onError: (message: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [missing, setMissing] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const editable = (status === 'placed' || status === 'accepted') && items.length > 1;

  function toggle(id: string) {
    setMissing((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function remove() {
    setBusy(true);
    onError(null);
    try {
      await removeOrderItems(supabase, orderId, [...missing]);
      setPicking(false);
      setMissing(new Set());
      // The live subscription reloads the order with the new items and total.
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not change the order.');
    } finally {
      setBusy(false);
    }
  }

  if (!picking) {
    return (
      <>
        {items.map((item) => (
          <ThemedText key={item.id} type="small">
            {item.qty} × {item.name_snapshot}
          </ThemedText>
        ))}
        {editable && (
          <Pressable accessibilityRole="button" onPress={() => setPicking(true)} hitSlop={6}>
            <ThemedText type="linkPrimary">Some items not in stock?</ThemedText>
          </Pressable>
        )}
      </>
    );
  }

  const everything = missing.size >= items.length;
  return (
    <View style={styles.box}>
      <ThemedText type="smallBold">Tick what you don&apos;t have</ThemedText>
      {items.map((item) => {
        const on = missing.has(item.id);
        return (
          <Pressable
            key={item.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => toggle(item.id)}
            style={styles.item}>
            <View style={[styles.tick, on && styles.tickOn]}>{on && <Text style={styles.tickMark}>✓</Text>}</View>
            <ThemedText type="small" style={[styles.flex, on && styles.struck]}>
              {item.qty} × {item.name_snapshot}
              {item.price_paise_snapshot ? ` · ${formatPaise(item.price_paise_snapshot * item.qty)}` : ''}
            </ThemedText>
          </Pressable>
        );
      })}
      <ThemedText type="small" themeColor="textSecondary">
        {everything
          ? 'To drop every item, reject the order instead.'
          : 'The student keeps the rest at the lower price and is told right away. These items are also marked out of stock.'}
      </ThemedText>
      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          disabled={busy || missing.size === 0 || everything}
          onPress={remove}
          style={[styles.remove, (busy || missing.size === 0 || everything) && styles.disabled]}>
          <Text style={styles.removeText}>
            Remove {missing.size || ''} {missing.size === 1 ? 'item' : 'items'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setPicking(false);
            setMissing(new Set());
          }}
          style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: Brand.red,
    borderRadius: Radius.medium,
    padding: Spacing.two,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  flex: {
    flex: 1,
  },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: {
    backgroundColor: Brand.red,
  },
  tickMark: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 600,
  },
  struck: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  remove: {
    backgroundColor: Brand.red,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  removeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 600,
  },
  cancel: {
    borderWidth: 1,
    borderColor: Brand.inkSoft,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  cancelText: {
    color: Brand.inkSoft,
    fontSize: 13,
    fontWeight: 600,
  },
  disabled: {
    opacity: 0.45,
  },
});
