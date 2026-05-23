import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, Card, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { DashboardTabs, type DashboardTab } from "@/components/dashboard-tabs";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { formatPHP, formatDate, formatBillPeriod, relativeTime } from "@/lib/format";

type TabKey = "home" | "bills" | "tenants" | "chat" | "profile";

export default function LandlordDashboard() {
  const [tab, setTab] = useState<TabKey>("home");
  const { user } = useAuth();
  const colors = useColors();

  const notifications = trpc.landlord.notifications.list.useQuery();
  const unreadCount = notifications.data?.filter((n) => !n.readAt).length ?? 0;

  const tabs: DashboardTab[] = [
    { key: "home", label: "Home", icon: "house.fill" },
    { key: "bills", label: "Bills", icon: "doc.text.fill" },
    { key: "tenants", label: "Tenants", icon: "person.2.fill" },
    { key: "chat", label: "Chat", icon: "bubble.left.and.bubble.right.fill" },
    { key: "profile", label: "Profile", icon: "person.fill" },
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
            <Text className="text-base font-bold text-foreground">UtilityBill</Text>
            <Text className="text-xs text-muted">Landlord · {user?.name ?? user?.email}</Text>
          </View>
        </View>
        <Pressable
          onPress={() => router.push("/landlord/notifications")}
          hitSlop={8}
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        >
          <View>
            <IconSymbol name="bell.fill" size={22} color={colors.text} />
            {unreadCount > 0 ? (
              <View
                className="bg-error rounded-full"
                style={{ position: "absolute", top: -2, right: -4, width: 10, height: 10 }}
              />
            ) : null}
          </View>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "home" ? <HomeTab /> : null}
        {tab === "bills" ? <BillsTab /> : null}
        {tab === "tenants" ? <TenantsTab /> : null}
        {tab === "chat" ? <ChatTab /> : null}
        {tab === "profile" ? <ProfileTab /> : null}
      </View>

      <DashboardTabs tabs={tabs} active={tab} onChange={(k) => setTab(k as TabKey)} />
    </ScreenContainer>
  );
}

// ---------- Tabs ----------

function HomeTab() {
  const stats = trpc.landlord.stats.useQuery();
  const colors = useColors();
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={stats.isFetching} onRefresh={() => stats.refetch()} />}
    >
      <Text className="text-xl font-bold text-foreground">Overview</Text>

      <View className="flex-row gap-3">
        <StatCard icon="person.2.fill" label="Tenants" value={String(stats.data?.tenants ?? "—")} />
        <StatCard icon="doc.text.fill" label="Unpaid" value={String(stats.data?.unpaidBills ?? "—")} />
      </View>
      <View className="flex-row gap-3">
        <StatCard
          icon="banknote"
          label="This month"
          value={stats.data ? formatPHP(stats.data.monthRevenue) : "—"}
        />
        <StatCard icon="sparkles" label="" value="" hidden />
      </View>

      <Text className="text-base font-semibold text-foreground mt-2">Quick actions</Text>
      <View className="gap-2">
        <Button title="Create a new bill" icon="plus" onPress={() => router.push("/landlord/bills/new")} />
        <Button title="Add a tenant" icon="person.fill" variant="secondary" onPress={() => router.push("/landlord/tenants/new")} />
        <Button title="Manage utility types" icon="bolt.fill" variant="secondary" onPress={() => router.push("/landlord/utilities")} />
      </View>

      <Text className="text-base font-semibold text-foreground mt-2">Recent bills</Text>
      {stats.data?.recentBills?.length ? (
        stats.data.recentBills.map((b: any) => (
          <Card key={b.id} onPress={() => router.push({ pathname: "/landlord/bills/[id]", params: { id: String(b.id) } })}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                  {b.tenantName || b.tenantEmail || `Tenant #${b.tenantId}`}
                </Text>
                <Text className="text-xs text-muted">{formatBillPeriod(b.createdAt)} · #{b.id}</Text>
              </View>
              <View className="items-end gap-1">
                <Text className="text-base font-semibold text-foreground">{formatPHP(b.totalAmount)}</Text>
                <StatusBadge status={b.status} />
              </View>
            </View>
          </Card>
        ))
      ) : (
        <Card>
          <Text className="text-sm text-muted">No bills yet. Tap "Create a new bill" above to get started.</Text>
        </Card>
      )}
    </ScrollView>
  );
}

function StatCard({
  icon,
  label,
  value,
  hidden,
}: {
  icon: React.ComponentProps<typeof IconSymbol>["name"];
  label: string;
  value: string;
  hidden?: boolean;
}) {
  const colors = useColors();
  if (hidden) return <View style={{ flex: 1 }} />;
  return (
    <View className="flex-1 bg-surface rounded-2xl border border-border p-4">
      <View className="flex-row items-center gap-2">
        <IconSymbol name={icon} size={18} color={colors.tint} />
        <Text className="text-xs text-muted">{label}</Text>
      </View>
      <Text className="text-xl font-bold text-foreground mt-2">{value}</Text>
    </View>
  );
}

function BillsTab() {
  const bills = trpc.landlord.bills.list.useQuery();
  return (
    <View style={{ flex: 1 }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-xl font-bold text-foreground">Bills</Text>
        <Button title="New" icon="plus" onPress={() => router.push("/landlord/bills/new")} />
      </View>
      <FlatList
        data={bills.data ?? []}
        keyExtractor={(b) => String(b.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 8 }}
        refreshControl={<RefreshControl refreshing={bills.isFetching} onRefresh={() => bills.refetch()} />}
        ListEmptyComponent={
          bills.isLoading ? (
            <ActivityIndicator className="mt-10" />
          ) : (
            <EmptyState
              icon="doc.text.fill"
              title="No bills yet"
              body="Tap New to create your first bill."
            />
          )
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push({ pathname: "/landlord/bills/[id]", params: { id: String(item.id) } })}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                  {(item as any).tenantName || (item as any).tenantEmail || `Tenant #${item.tenantId}`}
                </Text>
                <Text className="text-xs text-muted">{formatBillPeriod(item.createdAt)} · #{item.id}</Text>
                {item.dueDate ? (
                  <Text className="text-xs text-muted">Due {formatDate(item.dueDate)}</Text>
                ) : null}
              </View>
              <View className="items-end gap-1">
                <Text className="text-base font-semibold text-foreground">{formatPHP(item.totalAmount)}</Text>
                <StatusBadge status={item.status} />
              </View>
            </View>
          </Card>
        )}
      />
    </View>
  );
}

function TenantsTab() {
  const tenants = trpc.landlord.tenants.list.useQuery();
  return (
    <View style={{ flex: 1 }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-xl font-bold text-foreground">Tenants</Text>
        <Button title="Add" icon="plus" onPress={() => router.push("/landlord/tenants/new")} />
      </View>
      <FlatList
        data={tenants.data ?? []}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 8 }}
        refreshControl={<RefreshControl refreshing={tenants.isFetching} onRefresh={() => tenants.refetch()} />}
        ListEmptyComponent={
          tenants.isLoading ? (
            <ActivityIndicator className="mt-10" />
          ) : (
            <EmptyState
              icon="person.2.fill"
              title="No tenants yet"
              body="Add your first tenant to start billing them."
            />
          )
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push({ pathname: "/landlord/tenants/[id]", params: { id: String(item.id) } })}>
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
                <Text className="text-base font-bold text-primary">
                  {(item.name ?? item.email ?? "?").slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">{item.name ?? "—"}</Text>
                <Text className="text-xs text-muted">{item.email}</Text>
              </View>
              <View className="flex-row items-center gap-2">
                <StatusBadge status={item.status} />
                <Button
                  title="Bill"
                  icon="doc.text.fill"
                  variant="secondary"
                  onPress={() =>
                    router.push({ pathname: "/landlord/bills/new", params: { tenantId: String(item.id) } })
                  }
                />
              </View>
            </View>
          </Card>
        )}
      />
    </View>
  );
}

function ChatTab() {
  const convs = trpc.landlord.chat.conversations.useQuery();
  return (
    <View style={{ flex: 1 }}>
      <View className="px-4 py-3">
        <Text className="text-xl font-bold text-foreground">Conversations</Text>
      </View>
      <FlatList
        data={convs.data ?? []}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 8 }}
        refreshControl={<RefreshControl refreshing={convs.isFetching} onRefresh={() => convs.refetch()} />}
        ListEmptyComponent={
          convs.isLoading ? (
            <ActivityIndicator className="mt-10" />
          ) : (
            <EmptyState
              icon="bubble.left.and.bubble.right.fill"
              title="No conversations"
              body="Open a tenant's profile and start a chat."
            />
          )
        }
        renderItem={({ item }) => (
          <Card
            onPress={() =>
              router.push({ pathname: "/landlord/chat/[id]", params: { id: String(item.id), name: item.tenant?.name ?? "Tenant" } })
            }
          >
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
                <Text className="text-base font-bold text-primary">
                  {(item.tenant?.name ?? "?").slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">{item.tenant?.name}</Text>
                <Text className="text-xs text-muted" numberOfLines={1}>
                  {item.tenant?.email}
                </Text>
              </View>
              <Text className="text-xs text-muted">{relativeTime(item.lastMessageAt)}</Text>
            </View>
          </Card>
        )}
      />
    </View>
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
        <Text className="text-base text-foreground capitalize">{user?.role}</Text>
      </Card>
      <Button
        title="Change password"
        icon="key.fill"
        variant="secondary"
        onPress={() => router.push("/landlord/change-password")}
      />
      <Button
        title="Manage utility types"
        icon="bolt.fill"
        variant="secondary"
        onPress={() => router.push("/landlord/utilities")}
      />
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
