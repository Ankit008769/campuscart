import { Stack } from 'expo-router';

// The admin side of the app: only for admins past the Authenticator code.
export default function AdminLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Shops' }} />
      <Stack.Screen name="shop/[id]" options={{ title: 'Shop' }} />
      <Stack.Screen name="bills" options={{ title: 'Monthly bills' }} />
      <Stack.Screen name="suggestions" options={{ title: 'Suggestions' }} />
    </Stack>
  );
}
