import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, ScreenHeader, TextField } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

export default function ChangePasswordScreen() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const m = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      Alert.alert("Password changed", "Your password has been updated.");
      router.back();
    },
    onError: (err) => Alert.alert("Error", err.message),
  });

  const submit = () => {
    if (next.length < 8) return Alert.alert("Too short", "Use at least 8 characters.");
    if (next !== confirm) return Alert.alert("Mismatch", "New password and confirmation don't match.");
    m.mutate({ currentPassword: current, newPassword: next });
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader title="Change password" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
          <Text className="text-sm text-muted">
            Enter your current password to confirm, then choose a new one (at least 8 characters).
          </Text>
          <TextField label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
          <TextField label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" />
          <TextField label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" />
          <Button title="Update password" onPress={submit} loading={m.isPending} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
