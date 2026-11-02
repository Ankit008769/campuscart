import {
  ORDER_STATUS_LABEL,
  RIDER_STATUS_LABEL,
  applyAsRider,
  claimBatch,
  claimDelivery,
  earningsByWeek,
  formatPaise,
  getMyRider,
  getMyRiderCash,
  listBatchOffers,
  listDeliveryOffers,
  listMyDeliveries,
  listMyPayouts,
  releaseDelivery,
  setRiderOnline,
  transitionOrder,
  watchOrders,
} from '@campuscart/core';
import { Brand, Radius, StatusBadge } from '@campuscart/ui';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { RiderCash } from '@/components/rider-cash';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useShareRiderLocation } from '@/lib/live-location';
import { supabase } from '@/lib/supabase';

type Rider = NonNullable<Awaited<ReturnType<typeof getMyRider>>>;
type Offer = Awaited<ReturnType<typeof listDeliveryOffers>>[number];
type BatchOffer = Awaited<ReturnType<typeof listBatchOffers>>[number];
type Delivery = Awaited<ReturnType<typeof listMyDeliveries>>[number];
type Payout = Awaited<ReturnType<typeof listMyPayouts>>[number];
type HeldCash = Awaited<ReturnType<typeof getMyRiderCash>>;

// Offers aren't pushed to the screen live (riders can't watch orders they haven't taken), so poll.
const OFFER_POLL_MS = 10_000;
const OPEN = ['accepted', 'ready', 'out_for_delivery'];

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

export default function RiderScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  // undefined while loading, null when this student hasn't applied.
  const [rider, setRider] = useState<Rider | null | undefined>(undefined);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [batches, setBatches] = useState<BatchOffer[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [cash, setCash] = useState<HeldCash>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const me = await getMyRider(supabase, userId);
    setRider(me);
    if (me?.status === 'approved') {
      const [mine, paid, held] = await Promise.all([
        listMyDeliveries(supabase, userId),
        listMyPayouts(supabase),
        getMyRiderCash(supabase),
      ]);
      setDeliveries(mine);
      setPayouts(paid);
      setCash(held);
      const [single, batched] = me.online ? await Promise.all([listDeliveryOffers(supabase), listBatchOffers(supabase)]) : [[], []];
      setOffers(single);
      setBatches(batched);
    }
  }, [userId]);

  // Reload on focus, poll offers while the screen is open, and follow our own deliveries live.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let active = true;
      const refresh = () => load().catch((e: unknown) => active && setError(messageOf(e)));
      refresh();
      const timer = setInterval(refresh, OFFER_POLL_MS);
      const unsubscribe = watchOrders(supabase, `rider_id=eq.${userId}`, refresh);
      return () => {
        active = false;
        clearInterval(timer);
        unsubscribe();
      };
    }, [userId, load]),
  );

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  }

  if (rider === undefined) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </ThemedView>
    );
  }

  const open = deliveries.filter((d) => OPEN.includes(d.status));
  const weeks = earningsByWeek(deliveries);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error && <Text style={styles.error}>{error}</Text>}

        {(!rider || rider.status === 'rejected') && (
          <ApplyCard rider={rider} busy={busy === 'apply'} onApply={(upi) => run('apply', () => applyAsRider(supabase, upi))} />
        )}
        {rider && rider.status !== 'approved' && rider.status !== 'rejected' && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{RIDER_STATUS_LABEL[rider.status]}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {rider.status === 'applied'
                ? 'The CampusCart team will check your application and approve it soon. Payouts go to ' + rider.upi_vpa + '.'
                : (rider.admin_note ?? 'Contact the CampusCart team to deliver again.')}
            </ThemedText>
          </ThemedView>
        )}

        {rider?.status === 'approved' && (
          <>
            <ThemedView type="backgroundElement" style={[styles.card, styles.row]}>
              <View style={styles.flex}>
                <ThemedText type="smallBold">{rider.online ? 'You are online' : 'You are offline'}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {rider.online ? 'New delivery orders show up below and as notifications.' : 'Go online to see delivery orders.'}
                </ThemedText>
              </View>
              <Switch
                value={rider.online}
                disabled={busy === 'online'}
                onValueChange={(online) => run('online', () => setRiderOnline(supabase, online))}
                trackColor={{ true: Brand.green }}
              />
            </ThemedView>

            <RiderCash held={cash} />

            {open.length > 0 && <ThemedText type="smallBold">Your deliveries</ThemedText>}
            {open.map((delivery) => (
              <DeliveryCard key={delivery.id} delivery={delivery} busy={busy} run={run} />
            ))}

            {rider.online && (
              <>
                <ThemedText type="smallBold">Orders to deliver</ThemedText>
                {open.length === 0 &&
                  batches.map((batch) => (
                    <ThemedView key={batch.drop_point_id} type="backgroundElement" style={[styles.card, styles.batch]}>
                      <View style={styles.row}>
                        <ThemedText type="smallBold" style={styles.flex}>
                          {batch.orders} orders to {batch.drop_point_name}
                        </ThemedText>
                        <ThemedText type="smallBold">{formatPaise(batch.payout_paise)}</ThemedText>
                      </View>
                      <ThemedText type="small" themeColor="textSecondary">
                        One trip: pick up at {batch.shop_names.join(' and ')}. {batch.ready} ready now. Each student gives you their own
                        code.
                      </ThemedText>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy !== null}
                        onPress={() => run(batch.drop_point_id, () => claimBatch(supabase, batch.drop_point_id, batch.order_ids))}
                        style={[styles.primary, busy !== null && styles.disabled]}>
                        {busy === batch.drop_point_id ? (
                          <ActivityIndicator color="#ffffff" />
                        ) : (
                          <Text style={styles.primaryText}>Take all {batch.orders}</Text>
                        )}
                      </Pressable>
                    </ThemedView>
                  ))}
                {offers.length === 0 && (
                  <ThemedText type="small" themeColor="textSecondary">
                    Nothing right now. This list refreshes on its own.
                  </ThemedText>
                )}
                {offers.map((offer) => (
                  <ThemedView key={offer.id} type="backgroundElement" style={styles.card}>
                    <View style={styles.row}>
                      <ThemedText type="smallBold" style={styles.flex}>
                        {offer.shop_name} → {offer.drop_point_name}
                      </ThemedText>
                      <ThemedText type="smallBold">{formatPaise(offer.payout_paise)}</ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {offer.items} {offer.items === 1 ? 'item' : 'items'} ·{' '}
                      {offer.status === 'ready' ? 'Ready now' : `Ready in about ${offer.prep_minutes} min`}
                      {offer.gate_only ? ' · Hand over at the gate' : ''}
                    </ThemedText>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy !== null}
                      onPress={() => run(offer.id, () => claimDelivery(supabase, offer.id))}
                      style={[styles.primary, busy !== null && styles.disabled]}>
                      {busy === offer.id ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Take this delivery</Text>}
                    </Pressable>
                  </ThemedView>
                ))}
              </>
            )}

            <ThemedText type="smallBold">Earnings</ThemedText>
            {weeks.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                Earnings from delivered orders show up here. Payouts go to {rider.upi_vpa} every week.
              </ThemedText>
            )}
            {weeks.map((week) => {
              const payout = payouts.find((p) => p.week_start === week.weekStart);
              return (
                <ThemedView key={week.weekStart} type="backgroundElement" style={[styles.card, styles.row]}>
                  <View style={styles.flex}>
                    <ThemedText type="small">Week of {new Date(`${week.weekStart}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {week.deliveries} {week.deliveries === 1 ? 'delivery' : 'deliveries'}
                    </ThemedText>
                  </View>
                  <View style={styles.right}>
                    <ThemedText type="smallBold">{formatPaise(week.paise)}</ThemedText>
                    {payout?.paid_at ? (
                      <StatusBadge label="Paid" tone="good" />
                    ) : payout ? (
                      <StatusBadge label="Payout on its way" tone="neutral" />
                    ) : null}
                  </View>
                </ThemedView>
              );
            })}
          </>
        )}

        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <ThemedText type="linkPrimary">Back</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

function ApplyCard({ rider, busy, onApply }: { rider: Rider | null; busy: boolean; onApply: (upi: string) => void }) {
  const theme = useTheme();
  const [upi, setUpi] = useState(rider?.upi_vpa ?? '');
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Deliver for CampusCart</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Pick up orders from campus shops and bring them to hostels between classes. You earn for every delivery, paid to
        your UPI ID every week. Your mobile number from your profile is shared with the shop and the student while you
        deliver.
      </ThemedText>
      {rider?.status === 'rejected' && (
        <ThemedText type="small" themeColor="textSecondary">
          Your last application was not approved{rider.admin_note ? `: ${rider.admin_note}` : ''}. You can apply again.
        </ThemedText>
      )}
      <TextInput
        value={upi}
        onChangeText={setUpi}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="UPI ID, e.g. name@okaxis"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => onApply(upi)} style={[styles.primary, busy && styles.disabled]}>
        {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Apply to deliver</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push('/profile')}>
        <ThemedText type="linkPrimary">Check your mobile number</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function DeliveryCard({
  delivery,
  busy,
  run,
}: {
  delivery: Delivery;
  busy: string | null;
  run: (key: string, action: () => Promise<unknown>) => void;
}) {
  const theme = useTheme();
  const [code, setCode] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const sharing = useShareRiderLocation(delivery.id, delivery.status === 'out_for_delivery');
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const items = delivery.order_items.reduce((sum, item) => sum + item.qty, 0);
  const minutes = Math.max(0, Math.floor((now - Date.parse(delivery.rider_assigned_at ?? delivery.placed_at)) / 60000));

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.row}>
        <ThemedText type="smallBold" style={styles.flex}>
          #{delivery.code} · {delivery.shops?.name}
        </ThemedText>
        <StatusBadge label={ORDER_STATUS_LABEL[delivery.status]} tone={delivery.status === 'ready' ? 'good' : 'neutral'} />
      </View>
      <ThemedText type="small">
        To {delivery.drop_points?.name}
        {delivery.room_note ? `, ${delivery.room_note}` : ''}
        {delivery.drop_points?.gate_only ? ' (hand over at the gate)' : ''}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {items} {items === 1 ? 'item' : 'items'} · you earn {formatPaise(delivery.rider_payout_paise)} · taken {minutes} min ago
      </ThemedText>
      <ThemedText type="small">
        {delivery.pay_method === 'cash'
          ? `Collect ${formatPaise(delivery.total_paise)} in cash. It belongs to ${delivery.shops?.name ?? 'the shop'}: hand it over there.`
          : `The student pays ${delivery.shops?.name ?? 'the shop'} ${formatPaise(delivery.total_paise)} by UPI${delivery.shops?.upi_vpa ? ` (${delivery.shops.upi_vpa})` : ''}. Never take UPI to your own ID.`}
      </ThemedText>
      {delivery.profiles?.phone && (
        <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`tel:${delivery.profiles?.phone}`)}>
          <ThemedText type="linkPrimary">
            Call {delivery.profiles.name || 'the student'} ({delivery.profiles.phone})
          </ThemedText>
        </Pressable>
      )}

      {delivery.status === 'accepted' && (
        <ThemedText type="small" themeColor="textSecondary">
          The shop is preparing it. Head over; you get a notification when it&apos;s ready.
        </ThemedText>
      )}
      {delivery.status === 'ready' && (
        <Pressable
          accessibilityRole="button"
          disabled={busy !== null}
          onPress={() => run(delivery.id, () => transitionOrder(supabase, { orderId: delivery.id, to: 'out_for_delivery' }))}
          style={[styles.primary, busy !== null && styles.disabled]}>
          <Text style={styles.primaryText}>I&apos;ve picked it up</Text>
        </Pressable>
      )}
      {delivery.status === 'out_for_delivery' && (
        <ThemedText type="small" themeColor="textSecondary">
          {sharing === 'sharing'
            ? 'The student sees you on a map while this screen is open. It stops when you deliver.'
            : sharing === 'denied'
              ? 'Allow location access so the student can see you coming.'
              : 'Starting location sharing…'}
        </ThemedText>
      )}
      {delivery.status === 'out_for_delivery' && (
        <View style={styles.row}>
          <TextInput
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={4}
            placeholder="Student's code"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, styles.flex, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy !== null || code.length !== 4}
            onPress={() => run(delivery.id, () => transitionOrder(supabase, { orderId: delivery.id, to: 'delivered', code }))}
            style={[styles.primary, styles.inline, (busy !== null || code.length !== 4) && styles.disabled]}>
            <Text style={styles.primaryText}>Delivered</Text>
          </Pressable>
        </View>
      )}
      {(delivery.status === 'accepted' || delivery.status === 'ready') && (
        <Pressable
          accessibilityRole="button"
          disabled={busy !== null}
          onPress={() => run(delivery.id, () => releaseDelivery(supabase, delivery.id))}>
          <Text style={styles.release}>Can&apos;t make it? Give it back</Text>
        </Pressable>
      )}
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
  right: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
  },
  primary: {
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.two + Spacing.one,
    alignItems: 'center',
  },
  inline: {
    paddingHorizontal: Spacing.three,
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: 800,
    fontSize: 15,
  },
  disabled: {
    opacity: 0.45,
  },
  batch: {
    borderWidth: 2,
    borderColor: Brand.green,
  },
  release: {
    color: Brand.red,
    fontWeight: 600,
  },
  error: {
    color: Brand.red,
    backgroundColor: Brand.redSoft,
    borderRadius: Radius.small,
    padding: Spacing.two,
    fontSize: 14,
  },
});
