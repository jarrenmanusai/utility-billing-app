import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, TextField } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      setError(null);
      await signIn(data.token, data.user as any);
      const role = (data.user as any).role;
      if (role === "landlord") router.replace("/landlord");
      else if (role === "tenant") router.replace("/tenant");
      else if (role === "admin") router.replace("/admin");
      else router.replace("/");
    },
    onError: (err) => setError(err.message ?? "Unable to sign in."),
  });

  const submit = () => {
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    login.mutate({ email: email.trim().toLowerCase(), password });
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24 }} keyboardShouldPersistTaps="handled">
          <View className="flex-1 justify-center gap-6">
            <View className="items-center mb-2">
              <Image
                source={require("@/assets/images/icon.png")}
                style={{ width: 72, height: 72, borderRadius: 16 }}
              />
              <Text className="text-2xl font-bold text-foreground mt-3">Welcome back</Text>
              <Text className="text-sm text-muted text-center mt-1">
                Sign in to manage your bills, tenants, and payments.
              </Text>
            </View>

            <View className="gap-3">
              <TextField
                label="Email"
                placeholder="you@example.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                returnKeyType="next"
              />
              <TextField
                label="Password"
                placeholder="Enter your password"
                secureTextEntry={!showPwd}
                value={password}
                onChangeText={setPassword}
                rightIcon={showPwd ? "eye.slash.fill" : "eye.fill"}
                onRightIconPress={() => setShowPwd((v) => !v)}
                returnKeyType="done"
                onSubmitEditing={submit}
              />
              {error ? <Text className="text-sm text-error">{error}</Text> : null}

              <Button title="Sign in" onPress={submit} loading={login.isPending} />
            </View>

            <View className="flex-row items-center justify-center gap-1">
              <Text className="text-sm text-muted">New landlord?</Text>
              <Pressable onPress={() => router.push("/register")} hitSlop={6}>
                <Text className="text-sm font-semibold text-primary">Create account</Text>
              </Pressable>
            </View>

            <View className="items-center">
              <Pressable onPress={() => router.push("/reset")} hitSlop={6}>
                <Text className="text-sm text-muted">Have a reset link?</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
