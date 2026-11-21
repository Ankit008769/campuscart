import { sendSuggestion } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const MAX = 1000;

/** Students write an idea or a problem straight to the developer; admins read them on the admin side. */
export default function SuggestScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = text.trim().length >= 3 && !busy;

  async function send() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await sendSuggestion(supabase, session.user.id, text);
      setText('');
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send it. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="section">Help make Campus Cart better</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            A shop you want on the app, something confusing, a bug, an idea: write it here. It goes straight to the developer, who
            reads every one.
          </ThemedText>

          {sent && (
            <ThemedView style={styles.thanks}>
              <Text style={styles.thanksText}>Thank you! Your suggestion was sent. Got another? Write it below.</Text>
            </ThemedView>
          )}

          <TextInput
            value={text}
            onChangeText={(next) => {
              setText(next.slice(0, MAX));
              setSent(false);
            }}
            multiline
            textAlignVertical="top"
            placeholder="For example: Add a dark chocolate option at Nescafé"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Your suggestion"
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected, backgroundColor: theme.backgroundElement }]}
          />
          <ThemedText type="small" themeColor="textSecondary" style={styles.count}>
            {text.length}/{MAX}
          </ThemedText>

          <Pressable accessibilityRole="button" disabled={!ready} onPress={send} style={[styles.send, !ready && styles.disabled]}>
            {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.sendText}>Send to the developer</Text>}
          </Pressable>
          {error && <Text style={styles.error}>{error}</Text>}
          <ThemedText type="small" themeColor="textSecondary">
            Your name and email go with it, so we can reply if needed. For a problem with an order, call the shop from the order
            screen first.
          </ThemedText>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
  },
  thanks: {
    backgroundColor: Brand.greenSoft,
    borderRadius: Radius.medium,
    padding: Spacing.three,
  },
  thanksText: {
    color: Brand.green,
    fontSize: 14,
    fontWeight: 500,
  },
  input: {
    minHeight: 140,
    borderWidth: 1,
    borderRadius: Radius.medium,
    padding: Spacing.three,
    fontSize: 15,
  },
  count: {
    alignSelf: 'flex-end',
    marginTop: -Spacing.two,
  },
  send: {
    backgroundColor: Brand.green,
    borderRadius: 999,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  sendText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 600,
  },
  disabled: {
    opacity: 0.45,
  },
  error: {
    color: Brand.red,
    fontSize: 14,
  },
});
