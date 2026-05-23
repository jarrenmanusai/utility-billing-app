import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, Card, ScreenHeader, StatusBadge, TextField } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";
import { useConfirm, useToast } from "@/components/feedback";

export default function TenantDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const utils = trpc.useUtils();
  const toast = useToast();
  const confirm = useConfirm();
  const tenants = trpc.landlord.tenants.list.useQuery();
  const tenant = useMemo(() => tenants.data?.find((t) => t.id === id) ?? null, [tenants.data, id]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [newPwd, setNewPwd] = useState("");

  useEffect(() => {
    if (tenant) {
      setName(tenant.name ?? "");
      setEmail(tenant.email ?? "");
    }
  }, [tenant?.id]);

  const update = trpc.landlord.tenants.update.useMutation({
    onSuccess: () => {
      utils.landlord.tenants.list.invalidate();
      toast("Tenant info updated", { variant: "success" });
    },
    onError: (err) => toast(err.message, { variant: "error" }),
  });

  const reset = trpc.landlord.tenants.resetPassword.useMutation({
    onSuccess: () => {
      toast("Password reset", { variant: "success" });
      setNewPwd("");
    },
    onError: (err) => toast(err.message, { variant: "error" }),
  });

  const del = trpc.landlord.tenants.delete.useMutation({
    onSuccess: () => {
      utils.landlord.tenants.list.invalidate();
      toast("Tenant deleted", { variant: "success" });
      router.back();
    },
    onError: (err) => toast(err.message, { variant: "error" }),
  });

  const openChat = trpc.landlord.chat.open.useMutation({
    onSuccess: (data) => {
      router.push({ pathname: "/landlord/chat/[id]", params: { id: String(data.id), name: tenant?.name ?? "Tenant" } });
    },
    onError: (err) => toast(err.message, { variant: "error" }),
  });

  const createBill = () => {
    router.push({ pathname: "/landlord/bills/new", params: { tenantId: String(id) } });
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete tenant?",
      message: "This soft-deletes the tenant. They will no longer be able to sign in, but their bills will remain in your history.",
      confirmLabel: "Delete",
      destructive: true,
      icon: "trash.fill",
    });
    if (ok) del.mutate({ id });
  };

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

            {/* Quick actions */}
            <Card>
              <Text className="text-base font-semibold text-foreground mb-2">Quick actions</Text>
              <View className="gap-2">
                <Button title="Create bill for this tenant" icon="doc.text.fill" onPress={createBill} />
                <Button
                  title="Open chat"
                  icon="bubble.left.and.bubble.right.fill"
                  variant="secondary"
                  onPress={() => openChat.mutate({ tenantId: id })}
                  loading={openChat.isPending}
                />
              </View>
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
                  if (newPwd.length < 8) {
                    toast("Use at least 8 characters", { variant: "error" });
                    return;
                  }
                  reset.mutate({ id, newPassword: newPwd });
                }}
                loading={reset.isPending}
              />
            </Card>

            <Button title="Delete tenant" icon="trash.fill" variant="danger" onPress={handleDelete} loading={del.isPending} />
          </>
        ) : (
          <Text className="text-sm text-muted">Loading…</Text>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
