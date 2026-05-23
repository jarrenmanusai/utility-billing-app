import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, ScreenHeader, TextField } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

export default function ResetScreen() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  const reset = trpc.auth.resetWithToken.useMutation({
    onSuccess: () => {
      Alert.alert("Password updated", "You can now sign in with your new password.", [
        { text: "OK", onPress: () => router.replace("/login") },
      ]);
    },
    onError: (err) => setError(err.message ?? "Invalid or expired reset link."),
  });

  const submit = () => {
    setError(null);
    if (!token || !password) {
      setError("Please enter the reset code and a new password.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    reset.mutate({ token: token.trim(), newPassword: password });
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader title="Reset password" onBack={() => router.back()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
          <Text className="text-sm text-muted">
            Paste the reset code your admin shared with you. The code expires in 24 hours.
          </Text>
          <TextField
            label="Reset code"
            placeholder="Paste your code"
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label="New password"
            placeholder="At least 8 characters"
            secureTextEntry={!show}
            value={password}
            onChangeText={setPassword}
            rightIcon={show ? "eye.slash.fill" : "eye.fill"}
            onRightIconPress={() => setShow((v) => !v)}
          />
          <TextField
            label="Confirm password"
            placeholder="Re-enter new password"
            secureTextEntry={!show}
            value={confirm}
            onChangeText={setConfirm}
          />
          {error ? <Text className="text-sm text-error">{error}</Text> : null}
          <Button title="Update password" onPress={submit} loading={reset.isPending} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
