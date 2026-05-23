import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, ScreenHeader, TextField } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

export default function RegisterScreen() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = trpc.auth.register.useMutation({
    onSuccess: () => {
      Alert.alert(
        "Registration submitted",
        "Your account is now awaiting admin approval. You'll be able to sign in once it's approved.",
        [{ text: "OK", onPress: () => router.replace("/login") }],
      );
    },
    onError: (err) => setError(err.message ?? "Unable to register."),
  });

  const submit = () => {
    setError(null);
    if (!email || !name || !password) {
      setError("Please fill in all fields.");
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
    register.mutate({ email: email.trim().toLowerCase(), name: name.trim(), password });
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader title="Create landlord account" onBack={() => router.back()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
          <Text className="text-sm text-muted -mt-2">
            Tenants are created by their landlord — they do not register here.
          </Text>
          <TextField
            label="Full name"
            placeholder="Juan Dela Cruz"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
          <TextField
            label="Email"
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextField
            label="Password"
            placeholder="At least 8 characters"
            secureTextEntry={!showPwd}
            value={password}
            onChangeText={setPassword}
            rightIcon={showPwd ? "eye.slash.fill" : "eye.fill"}
            onRightIconPress={() => setShowPwd((v) => !v)}
          />
          <TextField
            label="Confirm password"
            placeholder="Re-enter password"
            secureTextEntry={!showPwd}
            value={confirm}
            onChangeText={setConfirm}
          />
          {error ? <Text className="text-sm text-error">{error}</Text> : null}
          <View className="mt-2">
            <Button title="Create account" onPress={submit} loading={register.isPending} />
          </View>
          <View className="flex-row items-center justify-center gap-1 mt-2">
            <Text className="text-sm text-muted">Already have an account?</Text>
            <Pressable onPress={() => router.replace("/login")} hitSlop={6}>
              <Text className="text-sm font-semibold text-primary">Sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
