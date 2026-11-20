import { findByBarcode, setStockCount } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { loadMyShop } from '@/lib/my-shop';
import { supabase } from '@/lib/supabase';

type Found = Awaited<ReturnType<typeof findByBarcode>>;
const RESTOCK = [1, 6, 12, 24];
const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

/** Scan a packet's barcode to find it in the shop's catalog and add to its stock count. */
export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [shopId, setShopId] = useState<string | null>(null);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadMyShop().then(
      (shop) => active && setShopId(shop?.id ?? null),
      () => {},
    );
    return () => {
      active = false;
    };
  }, []);

  function onScan(data: string) {
    if (barcode || !shopId) return;
    setBarcode(data);
    setMessage(null);
    findByBarcode(supabase, shopId, data).then(setFound, (e: unknown) => setMessage(messageOf(e)));
  }

  async function restock(variantId: string, current: number | null, add: number) {
    try {
      await setStockCount(supabase, variantId, (current ?? 0) + add);
      setMessage(`Added ${add}. Now ${(current ?? 0) + add} in stock.`);
      if (shopId && barcode) setFound(await findByBarcode(supabase, shopId, barcode));
    } catch (e) {
      setMessage(messageOf(e));
    }
  }

  if (!permission) return <ActivityIndicator style={styles.centered} />;
  if (!permission.granted) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ThemedText type="small">The camera reads barcodes on packets so you can restock in a tap.</ThemedText>
        <Pressable accessibilityRole="button" onPress={requestPermission} style={styles.primary}>
          <Text style={styles.primaryText}>Allow the camera</Text>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {!barcode ? (
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
          onBarcodeScanned={({ data }) => onScan(data)}
        />
      ) : (
        <View style={styles.result}>
          <ThemedText type="small" themeColor="textSecondary">
            Barcode {barcode}
          </ThemedText>
          {!found && <ActivityIndicator />}
          {found && !found.master && (
            <ThemedText type="small">
              CampusCart doesn&apos;t know this barcode yet. Ask the CampusCart team to add it to the product, or add the item
              from the Catalog tab.
            </ThemedText>
          )}
          {found?.master && found.listings.length === 0 && (
            <ThemedText type="small">
              {found.master.name} {found.master.size} isn&apos;t on your menu yet. Add it from the Catalog tab.
            </ThemedText>
          )}
          {found?.listings.map((listing) => (
            <ThemedView key={listing.id} type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">
                {listing.products.name}
                {listing.label ? ` (${listing.label})` : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {listing.stock_qty === null ? 'Stock not counted yet' : `${listing.stock_qty} in stock`}
              </ThemedText>
              <View style={styles.row}>
                {RESTOCK.map((n) => (
                  <Pressable key={n} accessibilityRole="button" onPress={() => restock(listing.id, listing.stock_qty, n)} style={styles.chip}>
                    <Text style={styles.chipText}>+{n}</Text>
                  </Pressable>
                ))}
              </View>
            </ThemedView>
          ))}
          {message && <ThemedText type="small">{message}</ThemedText>}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setBarcode(null);
              setFound(null);
              setMessage(null);
            }}
            style={styles.primary}>
            <Text style={styles.primaryText}>Scan another</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <ThemedText type="linkPrimary">Done</ThemedText>
          </Pressable>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  camera: {
    flex: 1,
  },
  result: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: 1,
    borderColor: Brand.green,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + Spacing.half,
  },
  chipText: {
    color: Brand.green,
    fontWeight: 600,
  },
  primary: {
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: 600,
  },
});
