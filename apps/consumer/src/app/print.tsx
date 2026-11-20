import {
  PRINT_FILE_MAX_BYTES,
  calculateBill,
  deliveryCharge,
  formatPaise,
  getFeeRules,
  listDropPoints,
  listPrintShops,
  placePrintOrder,
  pricePrintJob,
  uploadPrintJob,
  type FeeRules,
  type OrderMode,
  type PayMethod,
} from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { DropPointPicker } from '@/components/drop-point-picker';
import { QtyStepper } from '@/components/qty-stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type PrintShop = Awaited<ReturnType<typeof listPrintShops>>[number];
type DropPoint = Awaited<ReturnType<typeof listDropPoints>>[number];
type Picked = { uri: string; name: string };
type Priced = { jobId: string; pages: number; pricePaise: number };

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

export default function PrintScreen() {
  const { session } = useAuth();
  const theme = useTheme();
  const userId = session?.user.id;

  const [shops, setShops] = useState<PrintShop[] | null>(null);
  const [dropPoints, setDropPoints] = useState<DropPoint[]>([]);
  const [fees, setFees] = useState<FeeRules | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [file, setFile] = useState<Picked | null>(null);
  const [copies, setCopies] = useState(1);
  const [color, setColor] = useState(false);
  const [doubleSided, setDoubleSided] = useState(false);
  const [priced, setPriced] = useState<Priced | null>(null);
  const [mode, setMode] = useState<OrderMode>('pickup');
  const [dropPointId, setDropPointId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>('upi_at_handover');
  const [busy, setBusy] = useState<'pick' | 'price' | 'place' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listPrintShops(supabase), listDropPoints(supabase), getFeeRules(supabase)]).then(
      ([nextShops, points, rules]) => {
        if (!active) return;
        setShops(nextShops);
        setDropPoints(points);
        setFees(rules);
        if (nextShops.length === 1) setShopId(nextShops[0].shop_id);
      },
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, []);

  const shop = shops?.find((s) => s.shop_id === shopId);

  // Any change to the file or the options needs a fresh price from the server.
  const changeOptions = (change: () => void) => {
    change();
    setPriced(null);
  };

  async function pickFile() {
    setBusy('pick');
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return;
      if ((asset.size ?? 0) > PRINT_FILE_MAX_BYTES) throw new Error('PDFs can be up to 20 MB.');
      changeOptions(() => setFile({ uri: asset.uri, name: asset.name }));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  }

  async function uploadAndPrice() {
    if (!userId || !shopId || !file) return;
    setBusy('price');
    setError(null);
    try {
      // Loaded here, not at the top: routes are also evaluated in Node, which has no native file system.
      const { File } = await import('expo-file-system');
      const jobId = randomUUID();
      await uploadPrintJob(supabase, {
        jobId,
        studentId: userId,
        shopId,
        fileName: file.name,
        pdf: await new File(file.uri).arrayBuffer(),
        copies,
        color,
        doubleSided,
      });
      const { pages, pricePaise } = await pricePrintJob(supabase, jobId);
      setPriced({ jobId, pages, pricePaise });
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  }

  async function placeOrder() {
    if (!priced) return;
    setBusy('place');
    setError(null);
    try {
      const order = await placePrintOrder(supabase, {
        jobId: priced.jobId,
        mode,
        payMethod,
        dropPointId: mode === 'delivery' ? (dropPointId ?? undefined) : undefined,
      });
      router.replace({ pathname: '/order/[id]', params: { id: order.id } });
    } catch (e) {
      setError(messageOf(e));
      setBusy(null);
    }
  }

  if (!shops) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </ThemedView>
    );
  }

  const bill = priced && fees ? calculateBill(priced.pricePaise, mode, fees) : null;
  const canPlace = !!priced && busy === null && (mode === 'pickup' || !!dropPointId) && !!shop?.shops?.is_open;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {shops.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            No shop takes print orders right now.
          </ThemedText>
        )}

        {shops.length > 1 && <ThemedText type="smallBold">Which shop?</ThemedText>}
        <View style={styles.chips}>
          {shops.length > 1 &&
            shops.map((s) => (
              <Pressable
                key={s.shop_id}
                onPress={() => changeOptions(() => setShopId(s.shop_id))}
                style={[styles.chip, shopId === s.shop_id && styles.chipActive]}>
                <Text style={[styles.chipText, { color: shopId === s.shop_id ? '#ffffff' : theme.text }]}>{s.shops?.name}</Text>
              </Pressable>
            ))}
        </View>

        {shop && (
          <>
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{shop.shops?.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatPaise(shop.bw_page_paise)} a page in black and white, {formatPaise(shop.color_page_paise)} in colour. Up to{' '}
                {shop.max_pages} pages per file.
                {shop.shops?.is_open ? '' : ' Closed right now.'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Only the shop can open your file, and it is deleted a day after your order.
              </ThemedText>
            </ThemedView>

            <Pressable accessibilityRole="button" disabled={busy !== null} onPress={pickFile} style={styles.outline}>
              {busy === 'pick' ? (
                <ActivityIndicator color={Brand.green} />
              ) : (
                <Text style={styles.outlineText}>{file ? `📄 ${file.name}` : 'Choose a PDF'}</Text>
              )}
            </Pressable>

            <View style={styles.row}>
              <ThemedText type="small" style={styles.flex}>
                Copies
              </ThemedText>
              <QtyStepper
                qty={copies}
                onAdd={() => changeOptions(() => setCopies(Math.min(copies + 1, 20)))}
                onRemove={() => changeOptions(() => setCopies(Math.max(copies - 1, 1)))}
              />
            </View>
            <View style={styles.row}>
              <ThemedText type="small" style={styles.flex}>
                Colour
              </ThemedText>
              <Switch value={color} onValueChange={(v) => changeOptions(() => setColor(v))} trackColor={{ true: Brand.green }} />
            </View>
            <View style={styles.row}>
              <ThemedText type="small" style={styles.flex}>
                Print on both sides
              </ThemedText>
              <Switch value={doubleSided} onValueChange={(v) => changeOptions(() => setDoubleSided(v))} trackColor={{ true: Brand.green }} />
            </View>

            {!priced && (
              <Pressable
                accessibilityRole="button"
                disabled={!file || busy !== null}
                onPress={uploadAndPrice}
                style={[styles.primary, (!file || busy !== null) && styles.disabled]}>
                {busy === 'price' ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Upload and get the price</Text>}
              </Pressable>
            )}
          </>
        )}

        {priced && bill && (
          <>
            <ThemedText type="smallBold">How do you want it?</ThemedText>
            <View style={styles.segments}>
              {(['pickup', 'delivery'] as const).map((option) => {
                const offered = option === 'delivery' ? shop?.shops?.does_delivery : shop?.shops?.does_pickup;
                return (
                  <Pressable
                    key={option}
                    disabled={!offered}
                    onPress={() => setMode(option)}
                    style={[styles.segment, mode === option && styles.segmentActive, !offered && styles.disabled]}>
                    <Text style={[styles.segmentText, mode === option && styles.segmentTextActive]}>
                      {option === 'delivery' ? 'Deliver to me' : 'I will pick it up'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {mode === 'delivery' && (
              <DropPointPicker points={dropPoints} value={dropPointId} onChange={setDropPointId} />
            )}

            <ThemedText type="smallBold">How will you pay?</ThemedText>
            <View style={styles.segments}>
              {(['upi_at_handover', 'cash'] as const).map((option) => (
                <Pressable key={option} onPress={() => setPayMethod(option)} style={[styles.segment, payMethod === option && styles.segmentActive]}>
                  <Text style={[styles.segmentText, payMethod === option && styles.segmentTextActive]}>
                    {option === 'cash' ? 'Cash' : 'UPI at handover'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <ThemedView type="backgroundElement" style={styles.card}>
              <BillRow
                label={`${priced.pages} ${priced.pages === 1 ? 'page' : 'pages'}${copies > 1 ? ` × ${copies}` : ''}, ${color ? 'colour' : 'black and white'}`}
                paise={bill.subtotalPaise}
              />
              {deliveryCharge(bill) > 0 && <BillRow label="Delivery" paise={deliveryCharge(bill)} />}
              <BillRow label="Platform fee" paise={bill.platformFeePaise} />
              <BillRow label="To pay" paise={bill.totalPaise} bold />
            </ThemedView>

            <Pressable
              accessibilityRole="button"
              disabled={!canPlace}
              onPress={placeOrder}
              style={[styles.primary, !canPlace && styles.disabled]}>
              {busy === 'place' ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryText}>
                  {!shop?.shops?.is_open
                    ? 'The shop is closed right now'
                    : mode === 'delivery' && !dropPointId
                      ? 'Choose where to deliver'
                      : `Place print order · ${formatPaise(bill.totalPaise)}`}
                </Text>
              )}
            </Pressable>
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </ThemedView>
  );
}

function BillRow({ label, paise, bold }: { label: string; paise: number; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <ThemedText type={bold ? 'smallBold' : 'small'} style={styles.flex}>
        {label}
      </ThemedText>
      <ThemedText type={bold ? 'smallBold' : 'small'}>{formatPaise(paise)}</ThemedText>
    </View>
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
    gap: Spacing.three,
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: 1,
    borderColor: Brand.green,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + Spacing.half,
  },
  chipActive: {
    backgroundColor: Brand.green,
  },
  chipText: {
    fontSize: 13,
    fontWeight: 500,
  },
  segments: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Brand.green,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.two + Spacing.one,
  },
  segmentActive: {
    backgroundColor: Brand.green,
  },
  segmentText: {
    color: Brand.green,
    fontWeight: 600,
    fontSize: 14,
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  outline: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Brand.green,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  outlineText: {
    color: Brand.green,
    fontWeight: 600,
  },
  primary: {
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: 600,
    fontSize: 15,
  },
  disabled: {
    opacity: 0.45,
  },
  error: {
    color: Brand.red,
    backgroundColor: Brand.redSoft,
    borderRadius: Radius.small,
    padding: Spacing.two,
    fontSize: 14,
  },
});
