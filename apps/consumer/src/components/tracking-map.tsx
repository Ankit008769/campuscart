import { distanceMetres, etaMinutes, type RiderPosition } from '@campuscart/core';
import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import { Brand, Radius } from '@campuscart/ui';
import { StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

// OpenFreeMap: free OpenStreetMap vector tiles, no key, commercial use allowed. The map shows the
// OpenStreetMap attribution button, which the licence requires.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
// NIT Hamirpur, until the rider's first position arrives.
const CAMPUS = { lat: 31.7084, lng: 76.5274 };

type Place = { lat: number | null; lng: number | null; name: string } | null;

/** The rider moving towards the drop point, with the walking-pace arrival estimate. */
export function TrackingMap({ rider, dropPoint }: { rider: RiderPosition | null; dropPoint: Place }) {
  const target = dropPoint?.lat != null && dropPoint.lng != null ? { lat: dropPoint.lat, lng: dropPoint.lng } : null;
  const centre = rider ?? target ?? CAMPUS;
  const eta = rider && target ? etaMinutes(distanceMetres(rider, target)) : null;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">
        {!rider ? 'Waiting for the rider’s location…' : eta ? `About ${eta} min away` : 'Your rider is on the way'}
      </ThemedText>
      <View style={styles.mapBox}>
        <Map style={styles.map} mapStyle={MAP_STYLE} logo={false} attribution>
          <Camera center={[centre.lng, centre.lat]} zoom={16} />
          {target && (
            <Marker lngLat={[target.lng, target.lat]}>
              <View style={[styles.pin, styles.pinHome]}>
                <Text style={styles.pinText}>⌂</Text>
              </View>
            </Marker>
          )}
          {rider && (
            <Marker lngLat={[rider.lng, rider.lat]}>
              <View style={[styles.pin, styles.pinRider]}>
                <Text style={styles.pinText}>🛵</Text>
              </View>
            </Marker>
          )}
        </Map>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Shown only while your order is on the way. Locations aren&apos;t saved.
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
  mapBox: {
    height: 220,
    borderRadius: Radius.medium,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  pinRider: {
    backgroundColor: Brand.green,
  },
  pinHome: {
    backgroundColor: Brand.ink,
  },
  pinText: {
    color: '#ffffff',
    fontSize: 15,
  },
});
