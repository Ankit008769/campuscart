import {
  getCatalogItem,
  listAllCategories,
  parseRupees,
  productPhotoUrl,
  saveCatalogItem,
  type VariantInput,
} from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KeyboardScroll } from '@/components/keyboard-scroll';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { pickAndUploadItemPhoto, type PhotoSource } from '@/lib/item-photo';
import { loadMyShop } from '@/lib/my-shop';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

type Category = Awaited<ReturnType<typeof listAllCategories>>[number];
/** A size as typed: prices stay text until Save, so half-typed amounts don't jump around. */
type SizeDraft = { key: string; id?: string; label: string; price: string; mrp: string; inStock: boolean };

const VEG_OPTIONS: { value: boolean | null; label: string }[] = [
  { value: true, label: 'Veg' },
  { value: false, label: 'Non-veg' },
  { value: null, label: 'Not stated' },
];

let nextKey = 0;
const newSize = (): SizeDraft => ({ key: `new-${nextKey++}`, label: '', price: '', mrp: '', inStock: true });
const rupeesText = (paise: number) => (paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2));
const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

export default function ItemEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const theme = useTheme();

  const [shopId, setShopId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [isVeg, setIsVeg] = useState<boolean | null>(null);
  const [active, setActive] = useState(true);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [stockCredit, setStockCredit] = useState<string | null>(null);
  const [sizes, setSizes] = useState<SizeDraft[]>(() => [newSize()]);
  const [busy, setBusy] = useState<'photo' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([loadMyShop(), listAllCategories(supabase), isNew ? null : getCatalogItem(supabase, id)]).then(
      ([shop, allCategories, item]) => {
        if (!active) return;
        setShopId(shop?.id ?? null);
        setCategories(allCategories);
        if (item) {
          setName(item.name);
          setDescription(item.description);
          setCategoryId(item.category_id);
          setIsVeg(item.is_veg);
          setActive(item.active);
          setImagePath(item.image_path);
          setStockCredit(item.photo_credit);
          setSizes(
            [...item.variants]
              .sort((a, b) => a.sort - b.sort)
              .map((v) => ({
                key: v.id,
                id: v.id,
                label: v.label,
                price: rupeesText(v.price_paise),
                mrp: rupeesText(v.mrp_paise),
                inStock: v.in_stock,
              })),
          );
        }
        setLoaded(true);
      },
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [id, isNew]);

  const updateSize = (key: string, change: Partial<SizeDraft>) =>
    setSizes((current) => current.map((s) => (s.key === key ? { ...s, ...change } : s)));

  async function addPhoto(source: PhotoSource) {
    if (!shopId) return;
    setBusy('photo');
    setError(null);
    try {
      const path = await pickAndUploadItemPhoto(shopId, source);
      if (path) {
        setImagePath(path);
        setStockCredit(null);
      }
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  }

  async function onSave() {
    if (!shopId) return;
    const variants: VariantInput[] = [];
    for (const size of sizes) {
      const what = size.label.trim() || name.trim() || 'this item';
      const price = parseRupees(size.price);
      // A blank MRP means the item sells at MRP.
      const mrp = size.mrp.trim() ? parseRupees(size.mrp) : price;
      if (price === null || price <= 0) return setError(`Enter a price for ${what}, like 20 or 22.50.`);
      if (mrp === null || mrp <= 0) return setError(`Enter the MRP for ${what}, or leave it blank.`);
      variants.push({ id: size.id, label: size.label.trim(), pricePaise: price, mrpPaise: mrp, inStock: size.inStock });
    }
    setBusy('save');
    setError(null);
    try {
      await saveCatalogItem(supabase, {
        productId: isNew ? undefined : id,
        shopId,
        name,
        description,
        categoryId,
        isVeg,
        imagePath,
        active,
        variants,
      });
      router.back();
    } catch (e) {
      setError(messageOf(e));
      setBusy(null);
    }
  }

  if (!loaded) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </ThemedView>
    );
  }

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.backgroundSelected }];

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: isNew ? 'New item' : 'Edit item' }} />
      <KeyboardScroll contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.photoRow}>
          {imagePath ? (
            <Image source={productPhotoUrl(SUPABASE_URL, imagePath)} style={styles.photo} contentFit="cover" />
          ) : (
            <View style={[styles.photo, styles.noPhoto]}>
              <ThemedText type="small" themeColor="textSecondary">
                No photo
              </ThemedText>
            </View>
          )}
          <View style={styles.photoActions}>
            {busy === 'photo' ? (
              <ActivityIndicator />
            ) : (
              <>
                <Pressable accessibilityRole="button" onPress={() => addPhoto('camera')}>
                  <ThemedText type="linkPrimary">Take photo</ThemedText>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => addPhoto('library')}>
                  <ThemedText type="linkPrimary">Choose from gallery</ThemedText>
                </Pressable>
                {imagePath && (
                  <Pressable accessibilityRole="button" onPress={() => setImagePath(null)}>
                    <Text style={styles.removeText}>Remove photo</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        </View>
        {stockCredit && (
          <ThemedText type="small" themeColor="textSecondary">
            Stock photo ({stockCredit}). A photo of your own item is better.
          </ThemedText>
        )}

        <ThemedText type="smallBold">Name</ThemedText>
        <TextInput value={name} onChangeText={setName} maxLength={80} placeholder="Masala Maggi" placeholderTextColor={theme.textSecondary} style={inputStyle} />

        <ThemedText type="smallBold">Description (optional)</ThemedText>
        <TextInput
          value={description}
          onChangeText={setDescription}
          maxLength={200}
          multiline
          placeholder="With extra veggies"
          placeholderTextColor={theme.textSecondary}
          style={inputStyle}
        />

        <ThemedText type="smallBold">Category</ThemedText>
        <View style={styles.chips}>
          {categories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              selected={categoryId === category.id}
              onPress={() => setCategoryId(categoryId === category.id ? null : category.id)}
            />
          ))}
        </View>

        <ThemedText type="smallBold">Veg or non-veg</ThemedText>
        <View style={styles.chips}>
          {VEG_OPTIONS.map((option) => (
            <Chip key={option.label} label={option.label} selected={isVeg === option.value} onPress={() => setIsVeg(option.value)} />
          ))}
        </View>

        <ThemedText type="smallBold">Sizes and prices</ThemedText>
        {sizes.map((size) => (
          <ThemedView key={size.key} type="backgroundElement" style={styles.size}>
            <TextInput
              value={size.label}
              onChangeText={(label) => updateSize(size.key, { label })}
              maxLength={40}
              placeholder={sizes.length > 1 ? 'Size, e.g. Half plate' : 'Size (optional), e.g. 70 g'}
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
            />
            <View style={styles.row}>
              <View style={styles.flex}>
                <ThemedText type="small" themeColor="textSecondary">
                  Price ₹
                </ThemedText>
                <TextInput
                  value={size.price}
                  onChangeText={(price) => updateSize(size.key, { price })}
                  keyboardType="decimal-pad"
                  placeholder="20"
                  placeholderTextColor={theme.textSecondary}
                  style={inputStyle}
                />
              </View>
              <View style={styles.flex}>
                <ThemedText type="small" themeColor="textSecondary">
                  MRP ₹ (blank = same)
                </ThemedText>
                <TextInput
                  value={size.mrp}
                  onChangeText={(mrp) => updateSize(size.key, { mrp })}
                  keyboardType="decimal-pad"
                  placeholder={size.price || '20'}
                  placeholderTextColor={theme.textSecondary}
                  style={inputStyle}
                />
              </View>
            </View>
            <View style={styles.row}>
              <ThemedText type="small" style={styles.flex}>
                In stock
              </ThemedText>
              <Switch
                value={size.inStock}
                onValueChange={(inStock) => updateSize(size.key, { inStock })}
                trackColor={{ true: Brand.green }}
              />
            </View>
            {sizes.length > 1 && (
              <Pressable accessibilityRole="button" onPress={() => setSizes((current) => current.filter((s) => s.key !== size.key))}>
                <Text style={styles.removeText}>Remove this size</Text>
              </Pressable>
            )}
          </ThemedView>
        ))}
        {sizes.length < 10 && (
          <Pressable accessibilityRole="button" onPress={() => setSizes((current) => [...current, newSize()])}>
            <ThemedText type="linkPrimary">+ Add another size</ThemedText>
          </Pressable>
        )}

        <View style={styles.row}>
          <View style={styles.flex}>
            <ThemedText type="smallBold">Show to students</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Turn off to hide the item without deleting it.
            </ThemedText>
          </View>
          <Switch value={active} onValueChange={setActive} trackColor={{ true: Brand.green }} />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          accessibilityRole="button"
          disabled={busy !== null || !shopId}
          onPress={onSave}
          style={[styles.save, (busy !== null || !shopId) && styles.disabled]}>
          {busy === 'save' ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveText}>Save item</Text>}
        </Pressable>
      </KeyboardScroll>
    </ThemedView>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipActive]}>
      <Text style={[styles.chipText, { color: selected ? '#ffffff' : theme.text }]}>{label}</Text>
    </Pressable>
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
  photoRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  photo: {
    width: 96,
    height: 96,
    borderRadius: Radius.medium,
    backgroundColor: '#00000011',
  },
  noPhoto: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActions: {
    flex: 1,
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
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
  size: {
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
    gap: Spacing.one,
  },
  removeText: {
    color: Brand.red,
    fontWeight: 500,
  },
  error: {
    color: Brand.red,
    backgroundColor: Brand.redSoft,
    borderRadius: Radius.small,
    padding: Spacing.two,
    fontSize: 14,
  },
  save: {
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.three,
  },
  saveText: {
    color: '#ffffff',
    fontWeight: 600,
    fontSize: 16,
  },
  disabled: {
    opacity: 0.45,
  },
});
