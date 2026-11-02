import { formatPaise, isUpiVpa, upiPayUrl } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { Alert, Linking, Pressable, StyleSheet, Text } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/**
 * Who the student pays at handover, and how. UPI always goes to the shop's own UPI ID, even when a
 * rider brings the order, so a rider can never ask to be paid instead. Cash on a rider delivery is
 * collected for the shop.
 */
export function PayAtHandover({
  payMethod,
  totalPaise,
  shopName,
  shopUpi,
  orderCode,
  byRider,
}: {
  payMethod: 'cash' | 'upi_at_handover';
  totalPaise: number;
  shopName: string;
  shopUpi: string | null;
  orderCode: string;
  byRider: boolean;
}) {
  const amount = formatPaise(totalPaise);

  if (payMethod === 'cash') {
    return (
      <Card>
        <ThemedText type="smallBold">Pay {amount} in cash when you get your order</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {byRider ? `Your rider collects it for ${shopName}.` : `You pay ${shopName}.`}
        </ThemedText>
      </Card>
    );
  }

  const upi = shopUpi && isUpiVpa(shopUpi) ? shopUpi.trim() : null;
  const openUpiApp = async () => {
    if (!upi) return;
    const url = upiPayUrl({ vpa: upi, payee: shopName, amountPaise: totalPaise, note: `CampusCart ${orderCode}` });
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('No UPI app found', `Pay ${amount} to ${upi} from any UPI app.`);
    }
  };

  return (
    <Card>
      <ThemedText type="smallBold">
        Pay {amount} by UPI to {shopName}
      </ThemedText>
      {upi ? (
        <>
          <ThemedText type="small" selectable>
            UPI ID: {upi}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Pay ${amount} to ${shopName} with a UPI app`}
            onPress={openUpiApp}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>Pay with a UPI app</Text>
          </Pressable>
        </>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Pay when you get your order. Ask {shopName} for their UPI QR code.
        </ThemedText>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        {byRider
          ? `Pay only ${shopName}'s UPI ID. Riders never take UPI to their own ID. Check the name on your payment screen.`
          : `Check that the payment screen shows ${shopName} before you pay.`}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  pressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 800,
    fontSize: 15,
  },
});
