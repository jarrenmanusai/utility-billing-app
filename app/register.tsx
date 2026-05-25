import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, Card, ScreenHeader, TextField } from "@/components/ui/primitives";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import {
  checkEmail,
  formatPhPhoneInput,
  isValidPhPhone,
  normalizePhPhone,
} from "@/lib/validation";

export default function RegisterScreen() {
  const colors = useColors();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  // Live per-field validation hints. We compute these every render so the
  // user gets immediate feedback as they type — but we only show them once
  // they've actually entered something (no "required" yelling at empty
  // fields the moment the screen mounts).
  const emailHint = useMemo(() => {
    if (!email.trim()) return null;
    const result = checkEmail(email);
    return result.ok ? null : result.reason;
  }, [email]);

  const phoneHint = useMemo(() => {
    if (!phone.trim()) return null;
    return isValidPhPhone(phone)
      ? null
      : "Enter a PH mobile number starting with +63 or 09 (e.g. +63 917 555 1234).";
  }, [phone]);

  const phonePreview = useMemo(() => normalizePhPhone(phone), [phone]);

  const register = trpc.auth.register.useMutation({
    onSuccess: (_data, vars) => {
      setSubmittedEmail(vars.email);
    },
    onError: (err) => setError(err.message ?? "Unable to register."),
  });

  const submit = () => {
    setError(null);
    if (!email || !name || !phone || !password) {
      setError("Please fill in all fields.");
      return;
    }
    const emailCheck = checkEmail(email);
    if (!emailCheck.ok || !emailCheck.normalized) {
      setError(emailCheck.reason ?? "Please enter a valid email address.");
      return;
    }
    const normalizedPhone = normalizePhPhone(phone);
    if (!normalizedPhone) {
      setError(
        "Please enter a valid Philippine mobile number starting with +63 or 09 (e.g. +63 917 555 1234).",
      );
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
    register.mutate({
      email: emailCheck.normalized,
      name: name.trim(),
      phone: normalizedPhone,
      password,
    });
  };

  // Success state: account submitted, awaiting admin approval
  if (submittedEmail) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <ScreenHeader title="Account submitted" />
        <View className="flex-1 px-6 py-8 gap-6 justify-center">
          <View className="items-center">
            <View
              className="w-20 h-20 rounded-full items-center justify-center mb-4"
              style={{ backgroundColor: colors.success + "22" }}
            >
              <IconSymbol name="checkmark.circle.fill" size={56} color={colors.success} />
            </View>
            <Text className="text-2xl font-bold text-foreground text-center">
              You&apos;re almost in
            </Text>
            <Text className="text-base text-muted text-center mt-2">
              Your landlord account has been created and is now awaiting admin approval.
            </Text>
          </View>

          <Card>
            <View className="gap-3">
              <View className="flex-row items-start gap-2">
                <IconSymbol name="envelope.fill" size={18} color={colors.primary} />
                <View className="flex-1">
                  <Text className="text-xs text-muted">Email</Text>
                  <Text className="text-base text-foreground font-semibold">{submittedEmail}</Text>
                </View>
              </View>
              <View className="flex-row items-start gap-2">
                <IconSymbol name="hourglass" size={18} color={colors.warning} />
                <View className="flex-1">
                  <Text className="text-xs text-muted">Status</Text>
                  <Text className="text-base text-foreground font-semibold">Pending approval</Text>
                </View>
              </View>
              <View className="flex-row items-start gap-2">
                <IconSymbol name="info.circle.fill" size={18} color={colors.muted} />
                <View className="flex-1">
                  <Text className="text-xs text-muted">What happens next</Text>
                  <Text className="text-sm text-foreground mt-0.5">
                    An admin will review your account. Once approved, you can sign in with your
                    email and password and start managing tenants.
                  </Text>
                </View>
              </View>
            </View>
          </Card>

          <Button title="Back to sign in" onPress={() => router.replace("/login")} />
        </View>
      </ScreenContainer>
    );
  }

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
          <View>
            <TextField
              label="Email"
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            {emailHint ? (
              <Text className="text-xs text-error mt-1">{emailHint}</Text>
            ) : null}
          </View>
          <View>
            <TextField
              label="Mobile number (PH)"
              placeholder="+63 917 555 1234 or 0917 555 1234"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={(text) => setPhone(formatPhPhoneInput(text))}
            />
            {phoneHint ? (
              <Text className="text-xs text-error mt-1">{phoneHint}</Text>
            ) : phonePreview ? (
              <Text className="text-xs text-success mt-1">
                Will be saved as {phonePreview}
              </Text>
            ) : (
              <Text className="text-xs text-muted mt-1">
                Must start with +63 or 09 and be a real Philippine mobile number.
              </Text>
            )}
          </View>
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
