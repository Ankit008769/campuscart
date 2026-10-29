import { Stack } from 'expo-router';

// The shop side of the app: shown instead of the student screens to shop owners and counter staff.
export default function PartnerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="item/[id]" options={{ headerShown: true, title: 'Item' }} />
      <Stack.Screen name="scan" options={{ headerShown: true, title: 'Scan to restock' }} />
    </Stack>
  );
}
