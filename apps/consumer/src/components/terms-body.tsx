import { PRIVACY_POLICY_URL, TERMS, TERMS_SUMMARY, TERMS_UPDATED } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const FOR_LABEL = { everyone: null, students: 'For students', shops: 'For shops' } as const;

/** A plain-words summary first, then every section in full. Also shown inside the agree pop-up. */
export function TermsBody() {
  return (
    <View style={styles.body}>
        <ThemedText type="small" themeColor="textSecondary">
          Last updated {TERMS_UPDATED}
        </ThemedText>

        <View style={styles.summary}>
          <ThemedText type="smallBold" style={styles.onSoft}>
            The short version
          </ThemedText>
          {TERMS_SUMMARY.map((line) => (
            <View key={line} style={styles.point}>
              <ThemedText type="small" style={styles.onSoft}>
                •
              </ThemedText>
              <ThemedText type="small" style={[styles.flex, styles.onSoft]}>
                {line}
              </ThemedText>
            </View>
          ))}
        </View>

        {TERMS.map((section) => (
          <View key={section.title} style={styles.section}>
            <View style={styles.titleRow}>
              <ThemedText type="smallBold" style={styles.flex} accessibilityRole="header">
                {section.title}
              </ThemedText>
              {FOR_LABEL[section.for] && (
                <View style={[styles.tag, section.for === 'shops' && styles.tagShop]}>
                  <ThemedText type="small" style={styles.tagText}>
                    {FOR_LABEL[section.for]}
                  </ThemedText>
                </View>
              )}
            </View>
            {section.points.map((point) => (
              <View key={point} style={styles.point}>
                <ThemedText type="small" themeColor="textSecondary">
                  •
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                  {point}
                </ThemedText>
              </View>
            ))}
          </View>
        ))}

        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
          <ThemedText type="linkPrimary">Read the Privacy Policy</ThemedText>
        </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: Spacing.four,
  },
  summary: {
    backgroundColor: Brand.yellowSoft,
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  point: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  onSoft: {
    color: Brand.ink,
  },
  tag: {
    backgroundColor: Brand.yellowSoft,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  tagShop: {
    backgroundColor: Brand.greenSoft,
  },
  tagText: {
    color: Brand.ink,
    fontSize: 12,
  },
});
