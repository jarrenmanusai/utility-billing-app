import { useState } from "react";
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

type TabKey = "bills" | "chat" | "notif" | "profile";

export default function TenantDashboard() {
  const [tab, setTab] = useState<TabKey>("bills");
  const { user } = useAuth();
  const colors = useColors();
  const notifQuery = trpc.tenant.notifications.list.useQuery();
  const unread = notifQuery.data?.filter((n) => !n.readAt).length ?? 0;

  const tabs: DashboardTab[] = [
    { key: "bills", label: "Bills", icon: "doc.text.fill" },
    { key: "chat", label: "Chat", icon: "bubble.left.and.bubble.right.fill" },
    { key: "notif", label: "Alerts", icon: "bell.fill", badge: unread },
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
            <Text className="text-xs text-muted">Tenant · {user?.name ?? user?.email}</Text>
          </View>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "bills" ? <BillsTab /> : null}
        {tab === "chat" ? <ChatTab /> : null}
        {tab === "notif" ? <NotifTab /> : null}
        {tab === "profile" ? <ProfileTab /> : null}
      </View>

      <DashboardTabs tabs={tabs} active={tab} onChange={(k) => setTab(k as TabKey)} />
    </ScreenContainer>
  );
}

function BillsTab() {
  const bills = trpc.tenant.bills.list.useQuery();
  return (
    <View style={{ flex: 1 }}>
      <View className="px-4 py-3">
        <Text className="text-xl font-bold text-foreground">My bills</Text>
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
              body="When your landlord deploys a bill, it will show up here."
            />
          )
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push({ pathname: "/tenant/bills/[id]", params: { id: String(item.id) } })}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                  {formatBillPeriod(item.deployedAt ?? item.createdAt)} bill
                </Text>
                <Text className="text-xs text-muted">Issued {formatDate(item.deployedAt ?? item.createdAt)} · #{item.id}</Text>
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

function ChatTab() {
  const open = trpc.tenant.chat.open.useMutation({
    onSuccess: (data) => router.push({ pathname: "/tenant/chat", params: { conversationId: String(data.id) } }),
  });
  const colors = useColors();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
      <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center">
        <IconSymbol name="bubble.left.and.bubble.right.fill" size={36} color={colors.tint} />
      </View>
      <Text className="text-lg font-bold text-foreground text-center">Chat with your landlord</Text>
      <Text className="text-sm text-muted text-center">
        Ask questions, send a payment proof, or share a meter reading.
      </Text>
      <Button title="Open chat" icon="paperplane.fill" onPress={() => open.mutate()} loading={open.isPending} />
    </View>
  );
}

function NotifTab() {
  const list = trpc.tenant.notifications.list.useQuery();
  const utils = trpc.useUtils();
  const markAll = trpc.tenant.notifications.markAllRead.useMutation({
    onSuccess: () => utils.tenant.notifications.list.invalidate(),
  });

  return (
    <View style={{ flex: 1 }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-xl font-bold text-foreground">Alerts</Text>
        {list.data && list.data.length > 0 ? (
          <Button title="Mark all read" variant="secondary" onPress={() => markAll.mutate()} loading={markAll.isPending} />
        ) : null}
      </View>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(n) => String(n.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 8 }}
        refreshControl={<RefreshControl refreshing={list.isFetching} onRefresh={() => list.refetch()} />}
        ListEmptyComponent={
          <EmptyState icon="bell.fill" title="No alerts" body="New bills and updates will show up here." />
        }
        renderItem={({ item }) => (
          <Card>
            <View className="flex-row items-start gap-3">
              <View className="w-2 h-2 rounded-full mt-2" style={{ backgroundColor: item.readAt ? "transparent" : "#0a7ea4" }} />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground">{item.title}</Text>
                {item.body ? <Text className="text-sm text-muted mt-0.5">{item.body}</Text> : null}
                <Text className="text-xs text-muted mt-1">{relativeTime(item.createdAt)}</Text>
              </View>
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
      <Text className="text-xs text-muted text-center">
        To change your password, ask your landlord or admin to issue a reset link.
      </Text>
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
