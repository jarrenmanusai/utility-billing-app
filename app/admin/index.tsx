import { useState } from "react";
import { Alert, FlatList, Image, Modal, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, Card, EmptyState, StatusBadge, TextField } from "@/components/ui/primitives";
import { DashboardTabs, type DashboardTab } from "@/components/dashboard-tabs";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { formatPHP, formatDateTime, relativeTime } from "@/lib/format";
import { useConfirm, useToast } from "@/components/feedback";

type TabKey = "stats" | "landlords" | "trash" | "antispam" | "releases" | "profile";

export default function AdminConsole() {
  const [tab, setTab] = useState<TabKey>("stats");
  const { user } = useAuth();

  const tabs: DashboardTab[] = [
    { key: "stats", label: "Stats", icon: "chart.bar.fill" },
    { key: "landlords", label: "Landlords", icon: "person.2.fill" },
    { key: "trash", label: "Trash", icon: "trash.fill" },
    { key: "antispam", label: "Spam", icon: "shield.fill" },
    { key: "releases", label: "APK", icon: "arrow.down.app.fill" },
    { key: "profile", label: "Me", icon: "person.fill" },
  ];

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b border-border">
        <View className="flex-row items-center gap-2">
          <Image
            source={require("@/assets/images/icon.png")}
            style={{ width: 32, height: 32, borderRadius: 8 }}
          />
          <View>
            <Text className="text-base font-bold text-foreground">UtilityFlow</Text>
            <Text className="text-xs text-muted">Admin · {user?.name ?? user?.email}</Text>
          </View>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "stats" ? <StatsTab onNavigate={(k) => setTab(k)} /> : null}
        {tab === "landlords" ? <LandlordsTab /> : null}
        {tab === "trash" ? <TrashTab /> : null}
        {tab === "antispam" ? <AntiSpamTab /> : null}
        {tab === "releases" ? <ReleasesTab /> : null}
        {tab === "profile" ? <ProfileTab /> : null}
      </View>

      <DashboardTabs tabs={tabs} active={tab} onChange={(k) => setTab(k as TabKey)} />
    </ScreenContainer>
  );
}

// ---------- Stats ----------

function StatsTab({ onNavigate }: { onNavigate: (tab: TabKey) => void }) {
  const stats = trpc.admin.stats.useQuery();
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={stats.isFetching} onRefresh={() => stats.refetch()} />}
    >
      <Text className="text-xl font-bold text-foreground">Platform overview</Text>
      <Text className="text-xs text-muted">Tap a card to jump to its section.</Text>
      <View className="flex-row gap-3">
        <StatCard icon="person.2.fill" label="Landlords" value={String(stats.data?.landlords ?? "—")} onPress={() => onNavigate("landlords")} />
        <StatCard icon="person.fill" label="Tenants" value={String(stats.data?.tenants ?? "—")} />
      </View>
      <View className="flex-row gap-3">
        <StatCard icon="doc.text.fill" label="Total bills" value={String(stats.data?.bills ?? "—")} />
        <StatCard icon="banknote" label="Total revenue" value={stats.data ? formatPHP(stats.data.revenue) : "—"} />
      </View>
      <View className="flex-row gap-3">
        <StatCard icon="hourglass" label="Pending" value={String(stats.data?.pendingLandlords ?? "—")} onPress={() => onNavigate("landlords")} />
        <StatCard icon="lock.fill" label="Frozen" value={String(stats.data?.frozenLandlords ?? "—")} onPress={() => onNavigate("landlords")} />
      </View>
    </ScrollView>
  );
}

function StatCard({
  icon,
  label,
  value,
  onPress,
}: {
  icon: React.ComponentProps<typeof IconSymbol>["name"];
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const colors = useColors();
  const content = (
    <View className="flex-1 bg-surface rounded-2xl border border-border p-4">
      <View className="flex-row items-center gap-2">
        <IconSymbol name={icon} size={18} color={colors.tint} />
        <Text className="text-xs text-muted">{label}</Text>
      </View>
      <View className="flex-row items-center justify-between mt-2">
        <Text className="text-xl font-bold text-foreground">{value}</Text>
        {onPress ? <IconSymbol name="chevron.right" size={16} color={colors.muted} /> : null}
      </View>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.6 }]}
    >
      {content}
    </Pressable>
  );
}

// ---------- Landlords ----------

function LandlordsTab() {
  const [filter, setFilter] = useState<"pending" | "active" | "frozen">("pending");
  const utils = trpc.useUtils();
  const list = trpc.admin.landlords.list.useQuery({ status: filter });
  const confirm = useConfirm();
  const toast = useToast();

  // Tracks which (id, action) is currently in-flight for per-row loading state
  const [busy, setBusy] = useState<{ id: number; action: string } | null>(null);
  const isBusy = (id: number, action: string) => busy?.id === id && busy.action === action;

  const approve = trpc.admin.landlords.approve.useMutation({
    onSuccess: () => {
      utils.admin.landlords.list.invalidate();
      toast("Landlord approved", { variant: "success" });
    },
    onError: (e) => toast(e.message ?? "Approval failed", { variant: "error" }),
    onSettled: () => setBusy(null),
  });
  const reject = trpc.admin.landlords.reject.useMutation({
    onSuccess: () => {
      utils.admin.landlords.list.invalidate();
      toast("Landlord rejected", { variant: "success" });
    },
    onError: (e) => toast(e.message ?? "Action failed", { variant: "error" }),
    onSettled: () => setBusy(null),
  });
  const freeze = trpc.admin.landlords.freeze.useMutation({
    onSuccess: () => {
      utils.admin.landlords.list.invalidate();
      toast("Landlord frozen", { variant: "success" });
    },
    onError: (e) => toast(e.message ?? "Action failed", { variant: "error" }),
    onSettled: () => setBusy(null),
  });
  const unfreeze = trpc.admin.landlords.unfreeze.useMutation({
    onSuccess: () => {
      utils.admin.landlords.list.invalidate();
      toast("Landlord unfrozen", { variant: "success" });
    },
    onError: (e) => toast(e.message ?? "Action failed", { variant: "error" }),
    onSettled: () => setBusy(null),
  });
  const softDel = trpc.admin.landlords.softDelete.useMutation({
    onSuccess: () => {
      utils.admin.landlords.list.invalidate();
      toast("Landlord moved to trash (tenants also deactivated)", { variant: "success", duration: 3500 });
    },
    onError: (e) => toast(e.message ?? "Delete failed", { variant: "error" }),
    onSettled: () => setBusy(null),
  });
  const issueLink = trpc.admin.landlords.issueResetLink.useMutation({
    onSuccess: (data) => toast(`Reset token: ${data.token.slice(0, 12)}… (valid 24h)`, { variant: "info", duration: 4500 }),
    onError: (e) => toast(e.message ?? "Action failed", { variant: "error" }),
    onSettled: () => setBusy(null),
  });

  const [resetTargetId, setResetTargetId] = useState<number | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const directReset = trpc.admin.landlords.directReset.useMutation({
    onSuccess: () => {
      toast("Password updated", { variant: "success" });
      setResetTargetId(null);
      setNewPwd("");
    },
    onError: (e) => toast(e.message ?? "Reset failed", { variant: "error" }),
  });

  const onApprove = (id: number, name: string) =>
    confirm({
      title: `Approve ${name}?`,
      message: "The landlord will be able to sign in immediately.",
      confirmLabel: "Approve",
      icon: "checkmark.circle.fill",
    }).then((ok) => {
      if (ok) {
        setBusy({ id, action: "approve" });
        approve.mutate({ id });
      }
    });

  const onReject = (id: number, name: string) =>
    confirm({
      title: `Reject ${name}?`,
      message: "The pending registration will be denied. This cannot be undone.",
      confirmLabel: "Reject",
      destructive: true,
      icon: "xmark.circle.fill",
    }).then((ok) => {
      if (ok) {
        setBusy({ id, action: "reject" });
        reject.mutate({ id });
      }
    });

  const onFreeze = (id: number, name: string) =>
    confirm({
      title: `Freeze ${name}?`,
      message: "The landlord will be blocked from signing in until you unfreeze them. Their data is preserved.",
      confirmLabel: "Freeze",
      destructive: true,
      icon: "lock.fill",
    }).then((ok) => {
      if (ok) {
        setBusy({ id, action: "freeze" });
        freeze.mutate({ id });
      }
    });

  const onUnfreeze = (id: number, name: string) =>
    confirm({
      title: `Unfreeze ${name}?`,
      message: "The landlord will be able to sign in again.",
      confirmLabel: "Unfreeze",
      icon: "lock.open.fill",
    }).then((ok) => {
      if (ok) {
        setBusy({ id, action: "unfreeze" });
        unfreeze.mutate({ id });
      }
    });

  const onDelete = (id: number, name: string) =>
    confirm({
      title: `Delete ${name}?`,
      message: "This moves the landlord and all of their tenants to Trash. You can restore them within 30 days.",
      confirmLabel: "Delete",
      destructive: true,
      icon: "trash.fill",
    }).then((ok) => {
      if (ok) {
        setBusy({ id, action: "delete" });
        softDel.mutate({ id });
      }
    });

  const onIssueLink = (id: number, name: string) =>
    confirm({
      title: `Issue reset link for ${name}?`,
      message: "A 24-hour token will be generated. Share it privately with the landlord.",
      confirmLabel: "Issue",
      icon: "link",
    }).then((ok) => {
      if (ok) {
        setBusy({ id, action: "issueLink" });
        issueLink.mutate({ id });
      }
    });

  return (
    <View style={{ flex: 1 }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-xl font-bold text-foreground">Landlords</Text>
      </View>
      <View className="flex-row gap-2 px-4 pb-2">
        {(["pending", "active", "frozen"] as const).map((f) => (
          <Button
            key={f}
            title={f.charAt(0).toUpperCase() + f.slice(1)}
            variant={filter === f ? "primary" : "secondary"}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(l) => String(l.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 8 }}
        refreshControl={<RefreshControl refreshing={list.isFetching} onRefresh={() => list.refetch()} />}
        ListEmptyComponent={<EmptyState icon="person.2.fill" title={`No ${filter} landlords`} />}
        renderItem={({ item }) => (
          <Card>
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">{item.name ?? item.email}</Text>
                <Text className="text-xs text-muted">{item.email}</Text>
                <Text className="text-xs text-muted">Joined {relativeTime(item.createdAt)}</Text>
              </View>
              <StatusBadge status={item.status} />
            </View>
            <View className="flex-row flex-wrap gap-2">
              {filter === "pending" ? (
                <>
                  <Button title="Approve" onPress={() => onApprove(item.id, item.name ?? item.email ?? "this landlord")} loading={isBusy(item.id, "approve")} />
                  <Button title="Reject" variant="danger" onPress={() => onReject(item.id, item.name ?? item.email ?? "this landlord")} loading={isBusy(item.id, "reject")} />
                </>
              ) : null}
              {filter === "active" ? (
                <>
                  <Button title="Freeze" variant="secondary" onPress={() => onFreeze(item.id, item.name ?? item.email ?? "this landlord")} loading={isBusy(item.id, "freeze")} />
                  <Button title="Delete" variant="danger" onPress={() => onDelete(item.id, item.name ?? item.email ?? "this landlord")} loading={isBusy(item.id, "delete")} />
                </>
              ) : null}
              {filter === "frozen" ? (
                <Button title="Unfreeze" onPress={() => onUnfreeze(item.id, item.name ?? item.email ?? "this landlord")} loading={isBusy(item.id, "unfreeze")} />
              ) : null}
              <Button title="Reset link" variant="secondary" onPress={() => onIssueLink(item.id, item.name ?? item.email ?? "this landlord")} loading={isBusy(item.id, "issueLink")} />
              <Button title="Set password" variant="secondary" onPress={() => setResetTargetId(item.id)} />
            </View>
          </Card>
        )}
      />

      <Modal visible={resetTargetId !== null} transparent animationType="slide" onRequestClose={() => setResetTargetId(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
          <View className="bg-background rounded-t-3xl p-6 gap-3">
            <Text className="text-lg font-bold text-foreground">Direct password reset</Text>
            <Text className="text-sm text-muted">Set a new password for the landlord. Share it privately.</Text>
            <TextField label="New password" value={newPwd} onChangeText={setNewPwd} autoCapitalize="none" />
            <View className="flex-row gap-3 mt-2">
              <View style={{ flex: 1 }}>
                <Button title="Cancel" variant="secondary" onPress={() => { setResetTargetId(null); setNewPwd(""); }} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Save"
                  onPress={() => {
                    if (newPwd.length < 8) { toast("Use at least 8 characters", { variant: "error" }); return; }
                    if (resetTargetId) directReset.mutate({ id: resetTargetId, newPassword: newPwd });
                  }}
                  loading={directReset.isPending}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------- Trash ----------

function TrashTab() {
  const utils = trpc.useUtils();
  const list = trpc.admin.landlords.listTrash.useQuery();
  const confirm = useConfirm();
  const toast = useToast();

  const [busy, setBusy] = useState<{ id: number; action: string } | null>(null);
  const isBusy = (id: number, action: string) => busy?.id === id && busy.action === action;

  const restore = trpc.admin.landlords.restore.useMutation({
    onSuccess: () => {
      utils.admin.landlords.listTrash.invalidate();
      utils.admin.landlords.list.invalidate();
      toast("Landlord restored", { variant: "success" });
    },
    onError: (e) => toast(e.message ?? "Restore failed", { variant: "error" }),
    onSettled: () => setBusy(null),
  });
  const permDel = trpc.admin.landlords.permanentDelete.useMutation({
    onSuccess: (data) => {
      utils.admin.landlords.listTrash.invalidate();
      utils.admin.landlords.list.invalidate();
      utils.admin.stats.invalidate();
      const detail = data && "tenants" in data
        ? ` (${data.tenants} tenant${data.tenants === 1 ? "" : "s"}, ${data.bills} bill${data.bills === 1 ? "" : "s"} removed)`
        : "";
      toast(`Permanently deleted${detail}`, { variant: "success", duration: 4000 });
    },
    onError: (e) => toast(e.message ?? "Delete failed", { variant: "error" }),
    onSettled: () => setBusy(null),
  });

  const onRestore = (id: number, name: string) =>
    confirm({
      title: `Restore ${name}?`,
      message: "The landlord will be reactivated and can sign in again. Their tenants stay deactivated and must be restored separately.",
      confirmLabel: "Restore",
      icon: "arrow.uturn.backward",
    }).then((ok) => {
      if (ok) {
        setBusy({ id, action: "restore" });
        restore.mutate({ id });
      }
    });

  const onPermDel = (id: number, name: string) =>
    confirm({
      title: `Permanently delete ${name}?`,
      message: "This wipes the landlord, ALL of their tenants, bills, payments, and chats. This cannot be undone.",
      confirmLabel: "Delete forever",
      destructive: true,
      icon: "exclamationmark.triangle.fill",
    }).then((ok) => {
      if (ok) {
        setBusy({ id, action: "perm" });
        permDel.mutate({ id });
      }
    });

  return (
    <View style={{ flex: 1 }}>
      <View className="px-4 py-3">
        <Text className="text-xl font-bold text-foreground">Deleted landlords</Text>
        <Text className="text-xs text-muted">Restore within 30 days, or delete permanently.</Text>
      </View>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(l) => String(l.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 8 }}
        refreshControl={<RefreshControl refreshing={list.isFetching} onRefresh={() => list.refetch()} />}
        ListEmptyComponent={<EmptyState icon="trash.fill" title="Trash is empty" />}
        renderItem={({ item }) => (
          <Card>
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">{item.name ?? item.email}</Text>
                <Text className="text-xs text-muted">Deleted {relativeTime(item.deletedAt)}</Text>
              </View>
            </View>
            <View className="flex-row gap-2">
              <Button
                title="Restore"
                onPress={() => onRestore(item.id, item.name ?? item.email ?? "this landlord")}
                loading={isBusy(item.id, "restore")}
              />
              <Button
                title="Delete forever"
                variant="danger"
                onPress={() => onPermDel(item.id, item.name ?? item.email ?? "this landlord")}
                loading={isBusy(item.id, "perm")}
              />
            </View>
          </Card>
        )}
      />
    </View>
  );
}

// ---------- Anti-spam ----------

function AntiSpamTab() {
  const logs = trpc.admin.antispam.recentLogs.useQuery();
  const blocklist = trpc.admin.antispam.listBlocklist.useQuery();
  const settings = trpc.admin.antispam.getSettings.useQuery();
  const utils = trpc.useUtils();

  const [domain, setDomain] = useState("");
  const [cap, setCap] = useState("");

  const add = trpc.admin.antispam.addDomain.useMutation({ onSuccess: () => { utils.admin.antispam.listBlocklist.invalidate(); setDomain(""); } });
  const remove = trpc.admin.antispam.removeDomain.useMutation({ onSuccess: () => utils.admin.antispam.listBlocklist.invalidate() });
  const updateCap = trpc.admin.antispam.updateCap.useMutation({ onSuccess: () => utils.admin.antispam.getSettings.invalidate() });

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text className="text-xl font-bold text-foreground">Anti-spam</Text>

      <Card>
        <Text className="text-base font-semibold text-foreground mb-2">Pending landlord cap</Text>
        <Text className="text-xs text-muted mb-2">
          Maximum number of pending landlord registrations before new sign-ups are blocked.
          Current: <Text className="font-semibold text-foreground">{settings.data?.pendingLandlordCap ?? "—"}</Text>
        </Text>
        <TextField label="New cap" value={cap} onChangeText={setCap} keyboardType="number-pad" placeholder="100" />
        <View className="h-2" />
        <Button
          title="Update cap"
          onPress={() => {
            const n = parseInt(cap, 10);
            if (isNaN(n) || n < 1) return Alert.alert("Invalid", "Enter a positive number.");
            updateCap.mutate({ pendingLandlordCap: n });
          }}
          loading={updateCap.isPending}
        />
      </Card>

      <Card>
        <Text className="text-base font-semibold text-foreground mb-2">Blocked email domains</Text>
        <TextField label="Add domain" value={domain} onChangeText={setDomain} placeholder="e.g. tempmail.com" autoCapitalize="none" />
        <View className="h-2" />
        <Button title="Add to blocklist" onPress={() => add.mutate({ domain })} loading={add.isPending} />
        <View className="h-3" />
        {(blocklist.data ?? []).length === 0 ? (
          <Text className="text-xs text-muted">No blocked domains.</Text>
        ) : (
          (blocklist.data ?? []).map((b) => (
            <View key={b.domain} className="flex-row items-center justify-between py-2 border-b border-border">
              <Text className="text-sm text-foreground">{b.domain}</Text>
              <Button title="Remove" variant="secondary" onPress={() => remove.mutate({ domain: b.domain })} />
            </View>
          ))
        )}
      </Card>

      <Card>
        <Text className="text-base font-semibold text-foreground mb-2">Recent auth attempts (50)</Text>
        {(logs.data ?? []).length === 0 ? (
          <Text className="text-xs text-muted">No recent attempts.</Text>
        ) : (
          (logs.data ?? []).slice(0, 30).map((l) => (
            <View key={l.id} className="py-1.5 border-b border-border last:border-b-0">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-foreground">{l.email ?? "—"}</Text>
                <Text className={`text-xs font-semibold ${l.success ? "text-success" : "text-error"}`}>
                  {l.action} · {l.success ? "ok" : "fail"}
                </Text>
              </View>
              <Text className="text-xs text-muted">{l.ip ?? "—"} · {relativeTime(l.attemptedAt)}</Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

// ---------- Releases ----------

function ReleasesTab() {
  const list = trpc.admin.releases.list.useQuery();
  const utils = trpc.useUtils();
  const toast = useToast();
  const confirm = useConfirm();

  const [version, setVersion] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [pickedSize, setPickedSize] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const colors = useColors();

  const deploy = trpc.admin.releases.deploy.useMutation({
    onSuccess: (data, variables) => {
      utils.admin.releases.list.invalidate();
      setVersion("");
      setFileUrl("");
      setNotes("");
      setPickedName(null);
      setPickedSize(null);
      const v = variables?.version ?? "";
      const n = data.notified ?? 0;
      toast(`Deployed v${v} \u2014 notified ${n} user${n === 1 ? "" : "s"}.`, {
        variant: "success",
        duration: 3500,
      });
    },
    onError: (e) => toast(e.message ?? "Deploy failed", { variant: "error" }),
  });
  const publish = trpc.admin.releases.publish.useMutation({
    onSuccess: () => {
      utils.admin.releases.list.invalidate();
      toast("Release published and users notified", { variant: "success" });
    },
    onError: (e) => toast(e.message ?? "Publish failed", { variant: "error" }),
  });
  const del = trpc.admin.releases.delete.useMutation({
    onSuccess: () => {
      utils.admin.releases.list.invalidate();
      toast("Release deleted", { variant: "success" });
    },
    onError: (e) => toast(e.message ?? "Delete failed", { variant: "error" }),
  });

  const onPickApk = async () => {
    try {
      const { pickFile, uploadFile } = await import("@/lib/upload-file");
      // Accept .apk plus the standard Android package MIME type. On web the
      // browser uses `accept` to filter; on native we pass the same string
      // through expo-document-picker.
      const picked = await pickFile(".apk,application/vnd.android.package-archive");
      if (!picked) return;
      setPickedName(picked.name);
      setPickedSize(picked.size ?? null);
      setUploading(true);
      const url = await uploadFile(picked, "releases");
      setFileUrl(url);
      toast("APK uploaded — fill in version + notes, then Deploy", { variant: "success", duration: 3500 });
    } catch (e: any) {
      toast(e?.message ?? "Upload failed", { variant: "error", duration: 4500 });
    } finally {
      setUploading(false);
    }
  };

  const formatBytes = (n?: number | null) => {
    if (!n || n <= 0) return "";
    const mb = n / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${(n / 1024).toFixed(0)} KB`;
  };

  const onDeploy = async () => {
    if (!version.trim()) return toast("Version is required (e.g. 1.4.0)", { variant: "error" });
    if (!fileUrl.trim()) return toast("Upload an APK or paste an APK URL first", { variant: "error" });
    const ok = await confirm({
      title: `Deploy v${version.trim()}?`,
      message: "All active landlords and tenants will be notified to download the new update.",
      confirmLabel: "Deploy",
      icon: "arrow.up.app.fill",
    });
    if (!ok) return;
    deploy.mutate({
      version: version.trim(),
      fileUrl: fileUrl.trim(),
      notes: notes.trim() || undefined,
    });
  };

  const onDelete = (id: number, ver: string) =>
    confirm({
      title: `Delete v${ver}?`,
      message: "The release record is removed. Already-installed apps are unaffected.",
      confirmLabel: "Delete",
      destructive: true,
      icon: "trash.fill",
    }).then((ok) => {
      if (ok) del.mutate({ id });
    });

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text className="text-xl font-bold text-foreground">App updates</Text>
      <Text className="text-xs text-muted">
        Upload an APK and deploy a new version. Every active landlord and tenant
        will receive an in-app alert prompting them to download the update.
      </Text>

      <Card>
        <Text className="text-base font-semibold text-foreground mb-2">Deploy new version</Text>

        {/* APK file picker */}
        <Text className="text-sm font-medium text-foreground mb-1">APK file</Text>
        <Pressable
          onPress={uploading ? undefined : onPickApk}
          style={({ pressed }) => [
            {
              opacity: pressed && !uploading ? 0.7 : 1,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: colors.border,
              borderRadius: 12,
              padding: 14,
              backgroundColor: colors.surface,
            },
          ]}
        >
          <View className="flex-row items-center gap-3">
            <View
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.background }}
            >
              <IconSymbol
                name={pickedName ? "checkmark.seal.fill" : "arrow.up.app.fill"}
                size={20}
                color={pickedName ? colors.success : colors.tint}
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                {uploading ? "Uploading APK\u2026" : pickedName ? pickedName : "Tap to choose an APK"}
              </Text>
              <Text className="text-xs text-muted" numberOfLines={1}>
                {uploading
                  ? "This may take a minute on slow connections."
                  : pickedName
                  ? `${formatBytes(pickedSize)} \u00b7 ready to deploy`
                  : "Accepts .apk \u00b7 max 100 MB"}
              </Text>
            </View>
          </View>
        </Pressable>

        <View className="h-3" />
        <TextField label="Version (e.g. 1.4.0)" value={version} onChangeText={setVersion} autoCapitalize="none" placeholder="1.4.0" />
        <View className="h-2" />
        <TextField
          label="APK URL (auto-filled after upload)"
          value={fileUrl}
          onChangeText={setFileUrl}
          autoCapitalize="none"
          placeholder="https://\u2026"
        />
        <View className="h-2" />
        <TextField label="Release notes (optional)" value={notes} onChangeText={setNotes} placeholder="What's new in this release?" />
        <View className="h-3" />
        <Button
          title="Deploy update"
          icon="arrow.up.app.fill"
          onPress={onDeploy}
          loading={deploy.isPending || uploading}
        />
      </Card>

      <Text className="text-base font-semibold text-foreground mt-2">Release history</Text>
      {(list.data ?? []).length === 0 ? (
        <EmptyState icon="arrow.down.app.fill" title="No releases yet" />
      ) : (
        (list.data ?? []).map((r) => (
          <Card key={r.id}>
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-base font-semibold text-foreground">v{r.version}</Text>
                  {r.isLive ? <StatusBadge status="active" /> : null}
                </View>
                <Text className="text-xs text-muted">{formatDateTime(r.uploadedAt)}</Text>
              </View>
            </View>
            {r.notes ? <Text className="text-sm text-muted mb-2">{r.notes}</Text> : null}
            <View className="flex-row gap-2 flex-wrap">
              {!r.isLive ? (
                <Button
                  title="Publish & notify"
                  icon="paperplane.fill"
                  onPress={() => publish.mutate({ id: r.id })}
                  loading={publish.isPending}
                />
              ) : null}
              <Button
                title="Delete"
                variant="danger"
                onPress={() => onDelete(r.id, r.version)}
              />
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

function ProfileTab() {
  const { user, signOut } = useAuth();
  const utils = trpc.useUtils();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text className="text-xl font-bold text-foreground">Profile</Text>
      <Card>
        <Text className="text-sm text-muted">Name</Text>
        <Text className="text-base font-semibold text-foreground">{user?.name ?? "—"}</Text>
        <View className="h-3" />
        <Text className="text-sm text-muted">Email</Text>
        <Text className="text-base text-foreground">{user?.email}</Text>
        <View className="h-3" />
        <Text className="text-sm text-muted">Role</Text>
        <Text className="text-base text-foreground">Admin (owner)</Text>
      </Card>
      <Button
        title="About app"
        icon="info.circle"
        variant="secondary"
        onPress={() => router.push("/about")}
      />
      <Button
        title="Sign out"
        icon="power"
        variant="danger"
        onPress={async () => {
          await signOut();
          await utils.invalidate();
          router.replace("/login");
        }}
      />
    </ScrollView>
  );
}
