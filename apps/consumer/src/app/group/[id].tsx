import {
  cancelGroupOrder,
  formatPaise,
  getGroupOrder,
  getShopMenu,
  leaveGroupOrder,
  placeGroupOrder,
  setGroupItems,
  setGroupPaid,
  type GroupItem,
} from '@campuscart/core';
import { Brand, Radius, StatusBadge } from '@campuscart/ui';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';

import { QtyStepper } from '@/components/qty-stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type Group = Awaited<ReturnType<typeof getGroupOrder>>;
type Menu = Awaited<ReturnType<typeof getShopMenu>>;

// Group tables aren't on Realtime; check for new members and the host placing it now and then.
const POLL_MS = 8000;
const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

export default function GroupOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session?.user.id;
  const [group, setGroup] = useState<Group | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [mine, setMine] = useState<Record<string, number> | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      getGroupOrder(supabase, id).then(
        (next) => {
          setGroup(next);
          setNow(Date.now());
        },
        (e: unknown) => setError(messageOf(e)),
      ),
    [id],
  );

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const shopId = group?.shop_id;
  useEffect(() => {
    if (!shopId) return;
    let active = true;
    getShopMenu(supabase, shopId).then(
      (next) => active && setMenu(next),
      () => {},
    );
    return () => {
      active = false;
    };
  }, [shopId]);

  // My items start from what I saved; after that the screen holds my edits until I save them.
  const myRow = group?.group_members.find((m) => m.student_id === me);
  const saved: Record<string, number> = Object.fromEntries(
    ((myRow?.items ?? []) as GroupItem[]).map((i) => [i.variant_id, i.qty]),
  );
  const picks = mine ?? saved;
  const dirty = mine !== null && JSON.stringify(mine) !== JSON.stringify(saved);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  if (!group) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </ThemedView>
    );
  }

  const isHost = group.host_id === me;
  const open = group.status === 'open';
  const minutesLeft = Math.max(0, Math.ceil((Date.parse(group.closes_at) - now) / 60000));
  const price = (variantId: string) => menu?.products.flatMap((p) => p.variants).find((v) => v.id === variantId)?.price_paise ?? 0;
  const myTotal = Object.entries(picks).reduce((t, [vid, qty]) => t + price(vid) * qty, 0);

  const setQty = (variantId: string, qty: number) => {
    const next = { ...picks };
    if (qty <= 0) delete next[variantId];
    else next[variantId] = Math.min(qty, 50);
    setMine(next);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">Group order from {group.shops?.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          To {group.drop_points?.name} ·{' '}
          {open ? `closes in ${minutesLeft} min` : group.status === 'placed' ? 'placed' : `cancelled${group.problem ? `: ${group.problem}` : ''}`}
        </ThemedText>

        {open && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small">
              Code <Text style={styles.code}>{group.code}</Text>. Anyone with it can add their own items until it closes.
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                Share.share({
                  message: `Join my CampusCart group order from ${group.shops?.name}: code ${group.code}, or open ${Linking.createURL(`group/join/${group.code}`)}`,
                })
              }>
              <ThemedText type="linkPrimary">Share with your wing</ThemedText>
            </Pressable>
          </ThemedView>
        )}

        <ThemedText type="smallBold">Who&apos;s in</ThemedText>
        {group.group_members.map((member) => {
          const items = (member.items ?? []) as GroupItem[];
          const count = items.reduce((t, i) => t + i.qty, 0);
          return (
            <View key={member.student_id} style={styles.row}>
              <ThemedText type="small" style={styles.flex}>
                {member.display_name || 'A student'}
                {member.student_id === group.host_id ? ' (host)' : ''} · {count} {count === 1 ? 'item' : 'items'}
              </ThemedText>
              {member.share_paise !== null && <ThemedText type="small">{formatPaise(member.share_paise)}</ThemedText>}
              {group.status === 'placed' && member.share_paise !== null && member.student_id !== group.host_id && (
                isHost ? (
                  <Switch
                    value={member.paid}
                    onValueChange={(paid) => run(() => setGroupPaid(supabase, group.id, member.student_id, paid))}
                    trackColor={{ true: Brand.green }}
                  />
                ) : (
                  <StatusBadge label={member.paid ? 'Paid' : 'Not paid yet'} tone={member.paid ? 'good' : 'neutral'} />
                )
              )}
            </View>
          );
        })}
        {group.status === 'placed' && (
          <ThemedText type="small" themeColor="textSecondary">
            {isHost
              ? 'Everyone pays you their share; you pay at handover. Tick each person off as they pay.'
              : `Your share is ${formatPaise(myRow?.share_paise ?? 0)}: your items plus your part of the fees. Pay the host.`}
          </ThemedText>
        )}
        {group.status === 'placed' && isHost && group.order_id && (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/order/[id]', params: { id: group.order_id ?? '' } })}>
            <ThemedText type="linkPrimary">Follow the order</ThemedText>
          </Pressable>
        )}

        {open && menu && (
          <>
            <ThemedText type="smallBold">Your items · {formatPaise(myTotal)}</ThemedText>
            {menu.products.map((product) =>
              product.variants.map((variant) => (
                <View key={variant.id} style={styles.row}>
                  <ThemedText type="small" style={styles.flex}>
                    {product.name}
                    {variant.label ? ` (${variant.label})` : ''} · {formatPaise(variant.price_paise)}
                  </ThemedText>
                  <QtyStepper
                    qty={picks[variant.id] ?? 0}
                    disabled={!variant.in_stock}
                    onAdd={() => setQty(variant.id, (picks[variant.id] ?? 0) + 1)}
                    onRemove={() => setQty(variant.id, (picks[variant.id] ?? 0) - 1)}
                  />
                </View>
              )),
            )}
            <Pressable
              accessibilityRole="button"
              disabled={!dirty || busy}
              onPress={() =>
                run(async () => {
                  await setGroupItems(supabase, group.id, Object.entries(picks).map(([variant_id, qty]) => ({ variant_id, qty })));
                  setMine(null);
                })
              }
              style={[styles.primary, (!dirty || busy) && styles.disabled]}>
              <Text style={styles.primaryText}>{dirty ? 'Save my items' : 'Saved'}</Text>
            </Pressable>
          </>
        )}

        {open && isHost && (
          <>
            <Pressable
              accessibilityRole="button"
              disabled={busy || dirty}
              onPress={() =>
                Alert.alert('Place the group order now?', 'Nobody can add or change items after this.', [
                  { text: 'Not yet', style: 'cancel' },
                  { text: 'Place it', onPress: () => run(() => placeGroupOrder(supabase, group.id)) },
                ])
              }
              style={[styles.primary, (busy || dirty) && styles.disabled]}>
              <Text style={styles.primaryText}>{dirty ? 'Save your items first' : 'Place the group order now'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => run(() => cancelGroupOrder(supabase, group.id))}>
              <Text style={styles.remove}>Cancel the group order</Text>
            </Pressable>
          </>
        )}
        {open && !isHost && (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              run(async () => {
                await leaveGroupOrder(supabase, group.id);
                router.back();
              })
            }>
            <Text style={styles.remove}>Leave this group order</Text>
          </Pressable>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  code: {
    fontWeight: 600,
    letterSpacing: 2,
  },
  primary: {
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: 600,
    fontSize: 15,
  },
  disabled: {
    opacity: 0.45,
  },
  remove: {
    color: Brand.red,
    fontWeight: 500,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  error: {
    color: Brand.red,
    backgroundColor: Brand.redSoft,
    borderRadius: Radius.small,
    padding: Spacing.two,
    fontSize: 14,
  },
});
