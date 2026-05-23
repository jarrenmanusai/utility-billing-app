import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, ScreenHeader, TextField } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

export default function NewTenantScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const create = trpc.landlord.tenants.create.useMutation({
    onSuccess: () => {
      utils.landlord.tenants.list.invalidate();
      Alert.alert(
        "Tenant added",
        "Share these credentials with your tenant so they can sign in.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    },
    onError: (err) => setError(err.message ?? "Unable to create tenant."),
  });

  const submit = () => {
    setError(null);
    if (!name || !email || !password) {
      setError("All fields are required.");
      return;
    }
    if (password.length < 8) {
      setError("Initial password must be at least 8 characters.");
      return;
    }
    create.mutate({ name, email: email.trim().toLowerCase(), initialPassword: password });
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader title="Add tenant" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
          <Text className="text-sm text-muted">
            You'll generate the initial credentials. Share them privately — the tenant can change their
            password once they sign in.
          </Text>
          <TextField label="Full name" value={name} onChangeText={setName} placeholder="Maria Santos" autoCapitalize="words" />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="tenant@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <TextField
            label="Initial password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {error ? <Text className="text-sm text-error">{error}</Text> : null}
          <Button title="Create tenant" onPress={submit} loading={create.isPending} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
