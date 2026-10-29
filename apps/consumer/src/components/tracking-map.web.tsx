import { distanceMetres, etaMinutes, type RiderPosition } from '@campuscart/core';
import { Radius } from '@campuscart/ui';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type Place = { lat: number | null; lng: number | null; name: string } | null;

/** The web build has no native map: the arrival estimate only. */
export function TrackingMap({ rider, dropPoint }: { rider: RiderPosition | null; dropPoint: Place }) {
  const target = dropPoint?.lat != null && dropPoint.lng != null ? { lat: dropPoint.lat, lng: dropPoint.lng } : null;
  const eta = rider && target ? etaMinutes(distanceMetres(rider, target)) : null;
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{eta ? `Your rider is about ${eta} min away` : 'Your rider is on the way'}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Open the CampusCart app on your phone to follow them on the map.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
