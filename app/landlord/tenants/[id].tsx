import { useMemo, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, Card, ScreenHeader, StatusBadge, TextField } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

export default function TenantDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const utils = trpc.useUtils();
  const tenants = trpc.landlord.tenants.list.useQuery();
  const tenant = useMemo(() => tenants.data?.find((t) => t.id === id) ?? null, [tenants.data, id]);

  const [name, setName] = useState(tenant?.name ?? "");
  const [email, setEmail] = useState(tenant?.email ?? "");
  const [newPwd, setNewPwd] = useState("");

  // Sync state when tenant first loads
  if (tenant && name === "" && email === "") {
    setName(tenant.name ?? "");
    setEmail(tenant.email ?? "");
  }

  const update = trpc.landlord.tenants.update.useMutation({
    onSuccess: () => {
      utils.landlord.tenants.list.invalidate();
      Alert.alert("Saved", "Tenant info updated.");
    },
    onError: (err) => Alert.alert("Error", err.message),
  });

  const reset = trpc.landlord.tenants.resetPassword.useMutation({
    onSuccess: () => {
      Alert.alert("Password reset", "The tenant's password has been updated.");
      setNewPwd("");
    },
    onError: (err) => Alert.alert("Error", err.message),
  });

  const del = trpc.landlord.tenants.delete.useMutation({
    onSuccess: () => {
      utils.landlord.tenants.list.invalidate();
      router.back();
    },
    onError: (err) => Alert.alert("Error", err.message),
  });

  const openChat = trpc.landlord.chat.open.useMutation({
    onSuccess: (data) => {
      router.push({ pathname: "/landlord/chat/[id]", params: { id: String(data.id), name: tenant?.name ?? "Tenant" } });
    },
  });

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader title={tenant?.name ?? "Tenant"} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {tenant ? (
          <>
            <Card>
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-base font-semibold text-foreground">Profile</Text>
                <StatusBadge status={tenant.status} />
              </View>
              <TextField label="Full name" value={name} onChangeText={setName} containerClassName="mb-3" />
              <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
              <View className="h-3" />
              <Button
                title="Save changes"
                onPress={() => update.mutate({ id, name, email })}
                loading={update.isPending}
              />
            </Card>

            <Card>
              <Text className="text-base font-semibold text-foreground mb-2">Reset password</Text>
              <Text className="text-xs text-muted mb-2">
                Use this if your tenant forgot their password. They can change it later from their profile.
              </Text>
              <TextField label="New password" value={newPwd} onChangeText={setNewPwd} autoCapitalize="none" />
              <View className="h-3" />
              <Button
                title="Set new password"
                variant="secondary"
                icon="key.fill"
                onPress={() => {
                  if (newPwd.length < 8) return Alert.alert("Too short", "Use at least 8 characters.");
                  reset.mutate({ id, newPassword: newPwd });
                }}
                loading={reset.isPending}
              />
            </Card>

            <Button title="Open chat with tenant" icon="bubble.left.and.bubble.right.fill" onPress={() => openChat.mutate({ tenantId: id })} loading={openChat.isPending} />

            <Button
              title="Delete tenant"
              icon="trash.fill"
              variant="danger"
              onPress={() =>
                Alert.alert("Delete tenant?", "This soft-deletes the tenant. They will no longer be able to sign in.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => del.mutate({ id }) },
                ])
              }
              loading={del.isPending}
            />
          </>
        ) : (
          <Text className="text-sm text-muted">Loading…</Text>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
