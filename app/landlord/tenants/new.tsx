import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, Card, ScreenHeader, TextField } from "@/components/ui/primitives";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function NewTenantScreen() {
  const colors = useColors();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);
  const utils = trpc.useUtils();

  const create = trpc.landlord.tenants.create.useMutation({
    onSuccess: (_data, vars) => {
      utils.landlord.tenants.list.invalidate();
      setCreated({ name: vars.name, email: vars.email, password: vars.initialPassword });
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

  if (created) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <ScreenHeader title="Tenant added" />
        <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
          <View className="items-center">
            <View
              className="w-20 h-20 rounded-full items-center justify-center mb-3"
              style={{ backgroundColor: colors.success + "22" }}
            >
              <IconSymbol name="checkmark.circle.fill" size={56} color={colors.success} />
            </View>
            <Text className="text-2xl font-bold text-foreground text-center">
              Tenant account created
            </Text>
            <Text className="text-sm text-muted text-center mt-1">
              Share these credentials with your tenant. They can change the password after signing in.
            </Text>
          </View>

          <Card>
            <View className="gap-3">
              <View>
                <Text className="text-xs text-muted">Name</Text>
                <Text className="text-base font-semibold text-foreground">{created.name}</Text>
              </View>
              <View>
                <Text className="text-xs text-muted">Email</Text>
                <Text className="text-base font-semibold text-foreground">{created.email}</Text>
              </View>
              <View>
                <Text className="text-xs text-muted">Initial password</Text>
                <Text className="text-base font-semibold text-foreground">{created.password}</Text>
              </View>
            </View>
          </Card>

          <View className="gap-2">
            <Button
              title="Add another tenant"
              variant="secondary"
              onPress={() => {
                setName("");
                setEmail("");
                setPassword("");
                setCreated(null);
              }}
            />
            <Button title="Done" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader title="Add tenant" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
          <Text className="text-sm text-muted">
            You&apos;ll generate the initial credentials. Share them privately — the tenant can change their
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
