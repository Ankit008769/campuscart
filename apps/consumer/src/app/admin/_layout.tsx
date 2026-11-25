import { Stack } from 'expo-router';

// The admin side of the app: only for admins past the Authenticator code.
export default function AdminLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Admin' }} />
      <Stack.Screen name="shop/[id]" options={{ title: 'Shop' }} />
      <Stack.Screen name="bills" options={{ title: 'Monthly bills' }} />
      <Stack.Screen name="suggestions" options={{ title: 'Suggestions' }} />
      <Stack.Screen name="students" options={{ title: 'Students' }} />
      <Stack.Screen name="notify" options={{ title: 'Send a notification' }} />
      <Stack.Screen name="orders" options={{ title: 'Live orders' }} />
      <Stack.Screen name="today" options={{ title: 'Today' }} />
      <Stack.Screen name="find" options={{ title: 'Find an order' }} />
      <Stack.Screen name="riders" options={{ title: 'Riders' }} />
      <Stack.Screen name="coupons" options={{ title: 'Coupons' }} />
    </Stack>
  );
}
