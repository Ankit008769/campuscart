import {
  DEFAULT_WALK_MINUTES,
  getShopTimes,
  getWalkMinutes,
  indianDay,
  parseShopHours,
  scheduleSlots,
  slotLabel,
  type OrderMode,
} from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type ShopTimes = Awaited<ReturnType<typeof getShopTimes>>;

/**
 * "As soon as possible" or a slot in the next 2 days. A closed shop can only be scheduled. The
 * slots follow the same rules as the database (schedule.ts), which checks the chosen one again.
 */
export function TimePicker({
  shopId,
  mode,
  dropPointId,
  value,
  onChange,
  onMustSchedule,
}: {
  shopId: string;
  mode: OrderMode;
  dropPointId: string | null;
  value: Date | null;
  onChange: (slot: Date | null) => void;
  /** Told true when the shop is closed now, so the order can only be scheduled. */
  onMustSchedule: (must: boolean) => void;
}) {
  const theme = useTheme();
  const [times, setTimes] = useState<ShopTimes | null>(null);
  const [walk, setWalk] = useState(DEFAULT_WALK_MINUTES);
  const [scheduling, setScheduling] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let active = true;
    getShopTimes(supabase, shopId).then(
      (next) => {
        if (!active) return;
        setTimes(next);
        if (!next.is_open) setScheduling(true);
        onMustSchedule(!next.is_open);
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [shopId, onMustSchedule]);

  useEffect(() => {
    if (mode !== 'delivery' || !dropPointId) return;
    let active = true;
    getWalkMinutes(supabase, shopId, dropPointId).then(
      (minutes) => active && setWalk(minutes),
      () => {},
    );
    return () => {
      active = false;
    };
  }, [shopId, mode, dropPointId]);

  // Slots slip into the past while the cart is open, so recompute every minute.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const slots = times
    ? scheduleSlots({
        now,
        prepMinutes: times.prep_minutes,
        walkMinutes: mode === 'delivery' ? walk : 0,
        hours: parseShopHours(times.hours),
      })
    : [];

  // A chosen slot that's no longer bookable (time passed, drop point changed) is dropped.
  const chosenStillValid = !value || slots.some((s) => +s === +value);
  useEffect(() => {
    if (!chosenStillValid) onChange(null);
  }, [chosenStillValid, onChange]);

  const days = [...new Set(slots.map((s) => indianDay(s)))];
  const shownDay = day && days.includes(day) ? day : days[0];
  const closed = times?.is_open === false;

  return (
    <View style={styles.wrap}>
      <ThemedText type="smallBold">When?</ThemedText>
      <View style={styles.segments}>
        <Pressable
          disabled={closed}
          onPress={() => {
            setScheduling(false);
            onChange(null);
          }}
          style={[styles.segment, !scheduling && styles.segmentActive, closed && styles.disabled]}>
          <Text style={[styles.segmentText, !scheduling && styles.segmentTextActive]}>As soon as possible</Text>
        </Pressable>
        <Pressable onPress={() => setScheduling(true)} style={[styles.segment, scheduling && styles.segmentActive]}>
          <Text style={[styles.segmentText, scheduling && styles.segmentTextActive]}>Schedule</Text>
        </Pressable>
      </View>
      {closed && (
        <ThemedText type="small" themeColor="textSecondary">
          The shop is closed right now. Pick a time and it gets your order when it&apos;s open.
        </ThemedText>
      )}

      {scheduling && times && slots.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          No times left in the next 2 days for this shop.
        </ThemedText>
      )}
      {scheduling && slots.length > 0 && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {days.map((d) => {
              const label = slotLabel(slots.find((s) => indianDay(s) === d) ?? now, now).day;
              return (
                <Pressable key={d} onPress={() => setDay(d)} style={[styles.chip, d === shownDay && styles.chipActive]}>
                  <Text style={[styles.chipText, { color: d === shownDay ? '#ffffff' : theme.text }]}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {slots
              .filter((s) => indianDay(s) === shownDay)
              .map((slot) => {
                const selected = !!value && +value === +slot;
                return (
                  <Pressable key={slot.toISOString()} onPress={() => onChange(slot)} style={[styles.chip, selected && styles.chipActive]}>
                    <Text style={[styles.chipText, { color: selected ? '#ffffff' : theme.text }]}>{slotLabel(slot, now).time}</Text>
                  </Pressable>
                );
              })}
          </ScrollView>
          <ThemedText type="small" themeColor="textSecondary">
            {value
              ? `Arrives around ${slotLabel(value, now).time}. The shop starts on it about ${times?.prep_minutes ?? 0} minutes before.`
              : 'Pick a time.'}
          </ThemedText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
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
    fontWeight: 700,
    fontSize: 14,
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  disabled: {
    opacity: 0.45,
  },
  chips: {
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
    fontWeight: 600,
  },
});
