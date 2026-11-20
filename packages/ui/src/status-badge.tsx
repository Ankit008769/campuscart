import { StyleSheet, Text, View } from 'react-native';

import { Brand, Radius } from './tokens';

type Tone = 'good' | 'bad' | 'neutral';

const TONES: Record<Tone, { background: string; text: string }> = {
  good: { background: Brand.greenSoft, text: Brand.green },
  bad: { background: Brand.redSoft, text: Brand.red },
  neutral: { background: Brand.yellowSoft, text: Brand.ink },
};

/** A small pill such as "Open", "Closed" or "Out of stock". */
export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  const colors = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors.background }]}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.small,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
  },
});
