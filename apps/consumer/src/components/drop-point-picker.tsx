import { Brand, Radius } from '@campuscart/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type PickablePoint = { id: string; name: string; kind: 'hostel' | 'department' | 'other'; gate_only: boolean };

const GROUPS: { kind: PickablePoint['kind']; title: string }[] = [
  { kind: 'hostel', title: 'Hostels' },
  { kind: 'department', title: 'Departments' },
  { kind: 'other', title: 'Around campus' },
];
// The drop points this phone picked last, newest first, so they come back as one-tap suggestions.
const RECENT_KEY = 'campuscart:recent-drop-points';
const MAX_SUGGESTIONS = 3;

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

/** True when every word typed starts a word of the place's name or its group, so "cse", "mech dep" and "girls" all work. */
function matches(point: PickablePoint, query: string): boolean {
  const typed = words(query);
  if (typed.length === 0) return true;
  const group = GROUPS.find((g) => g.kind === point.kind)?.title ?? '';
  const hay = words(`${point.name} ${group} ${point.gate_only ? 'girls reception' : ''}`);
  return typed.every((t) => hay.some((w) => w.startsWith(t)));
}

/**
 * Where an order goes: the chosen place, one-tap suggestions (the student's usual spot and their
 * recent ones), and a searchable list of every hostel, department and campus spot behind "Change".
 */
export function DropPointPicker({
  points,
  value,
  onChange,
  usualId,
}: {
  points: PickablePoint[];
  value: string | null;
  onChange: (id: string) => void;
  usualId?: string | null;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => setRecent(raw ? (JSON.parse(raw) as string[]) : []))
      .catch(() => {});
  }, []);

  const chosen = points.find((p) => p.id === value);
  const suggestions = useMemo(() => {
    const ids = [usualId, ...recent].filter((id): id is string => !!id);
    return [...new Set(ids)]
      .map((id) => points.find((p) => p.id === id))
      .filter((p): p is PickablePoint => !!p)
      .slice(0, MAX_SUGGESTIONS);
  }, [points, recent, usualId]);

  const sections = useMemo(() => {
    const found = points.filter((p) => matches(p, query));
    const top = query ? [] : suggestions;
    return [
      ...(top.length > 0 ? [{ title: 'Suggested', data: top }] : []),
      ...GROUPS.map((g) => ({ title: g.title, data: found.filter((p) => p.kind === g.kind) })).filter((s) => s.data.length > 0),
    ];
  }, [points, query, suggestions]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
    const next = [id, ...recent.filter((r) => r !== id)].slice(0, MAX_SUGGESTIONS);
    setRecent(next);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={chosen ? `Delivering to ${chosen.name}. Change` : 'Choose where to deliver'}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, { borderColor: chosen ? Brand.green : theme.backgroundSelected }, pressed && styles.pressed]}>
        <Icon name="location" size={20} color={theme.tint} />
        <View style={styles.flex}>
          <ThemedText type={chosen ? 'smallBold' : 'small'} themeColor={chosen ? 'text' : 'textSecondary'} numberOfLines={1}>
            {chosen?.name ?? 'Choose a hostel, department or spot'}
          </ThemedText>
          {chosen && (
            <ThemedText type="small" themeColor="textSecondary">
              {chosen.gate_only ? 'Handed over at the reception' : GROUPS.find((g) => g.kind === chosen.kind)?.title}
            </ThemedText>
          )}
        </View>
        <Text style={[styles.change, { color: theme.tint }]}>{chosen ? 'Change' : 'Search'}</Text>
      </Pressable>

      {suggestions.some((s) => s.id !== value) && (
        <View style={styles.chips}>
          {suggestions
            .filter((s) => s.id !== value)
            .map((s) => (
              <Pressable key={s.id} accessibilityRole="button" onPress={() => pick(s.id)} style={styles.chip}>
                <Text style={[styles.chipText, { color: theme.text }]} numberOfLines={1}>
                  {s.id === usualId ? `Usual: ${s.name}` : s.name}
                </Text>
              </Pressable>
            ))}
        </View>
      )}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <ThemedView style={styles.flex}>
          <SafeAreaView style={styles.flex}>
            <View style={styles.header}>
              <ThemedText type="section" style={styles.flex}>
                Where should it come?
              </ThemedText>
              <Pressable accessibilityRole="button" onPress={() => setOpen(false)} hitSlop={8}>
                <Text style={[styles.change, { color: theme.tint }]}>Close</Text>
              </Pressable>
            </View>
            <View style={[styles.search, { backgroundColor: theme.backgroundElement }]}>
              <Icon name="search" size={20} color={theme.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                autoFocus
                autoCorrect={false}
                placeholder="Search hostel, department, OAT, gate…"
                placeholderTextColor={theme.textSecondary}
                accessibilityLabel="Search drop points"
                style={[styles.searchInput, { color: theme.text }]}
              />
            </View>
            <SectionList
              sections={sections}
              keyExtractor={(item, i) => `${item.id}:${i}`}
              keyboardShouldPersistTaps="handled"
              stickySectionHeadersEnabled={false}
              contentContainerStyle={styles.list}
              renderSectionHeader={({ section }) => (
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
                  {section.title}
                </ThemedText>
              )}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.id === value }}
                  onPress={() => pick(item.id)}
                  style={({ pressed }) => [styles.row, item.id === value && { backgroundColor: theme.backgroundSelected }, pressed && styles.pressed]}>
                  <View style={styles.flex}>
                    <ThemedText type="small">{item.name}</ThemedText>
                    {item.gate_only && (
                      <ThemedText type="small" themeColor="textSecondary">
                        Handed over at the reception
                      </ThemedText>
                    )}
                  </View>
                  {item.id === usualId && (
                    <ThemedText type="small" themeColor="textSecondary">
                      Usual
                    </ThemedText>
                  )}
                </Pressable>
              )}
              ListEmptyComponent={
                <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                  No place called “{query}”. Try a shorter word, or pick the nearest hostel or gate.
                </ThemedText>
              }
            />
          </SafeAreaView>
        </ThemedView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
  change: {
    fontSize: 14,
    fontWeight: 600,
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
    maxWidth: '100%',
  },
  chipText: {
    fontSize: 13,
    fontWeight: 500,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    marginTop: Spacing.three,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Spacing.three,
  },
  list: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.six,
  },
  sectionTitle: {
    marginTop: Spacing.four,
    marginBottom: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.small,
  },
  empty: {
    marginTop: Spacing.four,
  },
});
