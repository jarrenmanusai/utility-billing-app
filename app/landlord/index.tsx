import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
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
type BillFilter = "all" | "unpaid" | "paid" | "draft";

export default function LandlordDashboard() {
  const [tab, setTab] = useState<TabKey>("home");
  // When the user lands on Bills via a Home stat card we want to pre-filter.
  // The default filter when Bills is opened directly is "all".
  const [billFilter, setBillFilter] = useState<BillFilter>("all");
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

  /**
   * Quick-action handler used by the Home overview stat cards.
   * Tapping a card switches to the relevant tab — and, where applicable,
   * preselects the right filter (e.g. "Unpaid" → Bills tab filtered to deployed).
   */
  const goTo = (target: TabKey, opts?: { billFilter?: BillFilter }) => {
    if (opts?.billFilter) setBillFilter(opts.billFilter);
    setTab(target);
  };

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
        {tab === "home" ? <HomeTab goTo={goTo} /> : null}
        {tab === "bills" ? (
          <BillsTab filter={billFilter} onFilterChange={setBillFilter} />
        ) : null}
        {tab === "tenants" ? <TenantsTab /> : null}
        {tab === "chat" ? <ChatTab /> : null}
        {tab === "profile" ? <ProfileTab /> : null}
      </View>

      <DashboardTabs
        tabs={tabs}
        active={tab}
        onChange={(k) => {
          // Navigating directly via the bottom bar resets the bill filter
          // so users always see the full list when they tap "Bills".
          if (k === "bills" && tab !== "bills") setBillFilter("all");
          setTab(k as TabKey);
        }}
      />
    </ScreenContainer>
  );
}

// ---------- Tabs ----------

interface HomeTabProps {
  goTo: (target: TabKey, opts?: { billFilter?: BillFilter }) => void;
}

function HomeTab({ goTo }: HomeTabProps) {
  const stats = trpc.landlord.stats.useQuery();
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={
        <RefreshControl refreshing={stats.isFetching} onRefresh={() => stats.refetch()} />
      }
    >
      <Text className="text-xl font-bold text-foreground">Overview</Text>

      <View className="flex-row gap-3">
        <StatCard
          icon="person.2.fill"
          label="Tenants"
          value={String(stats.data?.tenants ?? "—")}
          onPress={() => goTo("tenants")}
        />
        <StatCard
          icon="doc.text.fill"
          label="Unpaid"
          value={String(stats.data?.unpaidBills ?? "—")}
          onPress={() => goTo("bills", { billFilter: "unpaid" })}
        />
      </View>
      <View className="flex-row gap-3">
        <StatCard
          icon="banknote"
          label="This month"
          value={stats.data ? formatPHP(stats.data.monthRevenue) : "—"}
          onPress={() => goTo("bills", { billFilter: "paid" })}
        />
        <StatCard icon="sparkles" label="" value="" hidden />
      </View>

      <Text className="text-base font-semibold text-foreground mt-2">Quick actions</Text>
      <View className="gap-2">
        <Button
          title="Create a new bill"
          icon="plus"
          onPress={() => router.push("/landlord/bills/new")}
        />
        <Button
          title="Add a tenant"
          icon="person.fill"
          variant="secondary"
          onPress={() => router.push("/landlord/tenants/new")}
        />
        <Button
          title="Manage utility types"
          icon="bolt.fill"
          variant="secondary"
          onPress={() => router.push("/landlord/utilities")}
        />
      </View>

      <Text className="text-base font-semibold text-foreground mt-2">Recent bills</Text>
      {stats.data?.recentBills?.length ? (
        stats.data.recentBills.map((b: any) => (
          <Card
            key={b.id}
            onPress={() =>
              router.push({ pathname: "/landlord/bills/[id]", params: { id: String(b.id) } })
            }
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                  {b.tenantName || b.tenantEmail || `Tenant #${b.tenantId}`}
                </Text>
                <Text className="text-xs text-muted">
                  {formatBillPeriod(b.createdAt)} · #{b.id}
                </Text>
              </View>
              <View className="items-end gap-1">
                <Text className="text-base font-semibold text-foreground">
                  {formatPHP(b.totalAmount)}
                </Text>
                <StatusBadge status={b.status} />
              </View>
            </View>
          </Card>
        ))
      ) : (
        <Card>
          <Text className="text-sm text-muted">
            No bills yet. Tap "Create a new bill" above to get started.
          </Text>
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
  onPress,
}: {
  icon: React.ComponentProps<typeof IconSymbol>["name"];
  label: string;
  value: string;
  hidden?: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  if (hidden) return <View style={{ flex: 1 }} />;
  // Tappable when onPress is provided. Visually we add a subtle chevron so the
  // user knows the card is interactive rather than just a static figure.
  const interactive = !!onPress;
  return (
    <Pressable
      onPress={onPress}
      disabled={!interactive}
      style={({ pressed }) => [
        { flex: 1 },
        pressed && interactive && { opacity: 0.7, transform: [{ scale: 0.98 }] },
      ]}
    >
      <View className="bg-surface rounded-2xl border border-border p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2 flex-1">
            <IconSymbol name={icon} size={18} color={colors.tint} />
            <Text className="text-xs text-muted">{label}</Text>
          </View>
          {interactive ? (
            <IconSymbol name="chevron.right" size={14} color={colors.muted} />
          ) : null}
        </View>
        <Text className="text-xl font-bold text-foreground mt-2">{value}</Text>
      </View>
    </Pressable>
  );
}

interface BillsTabProps {
  filter: BillFilter;
  onFilterChange: (f: BillFilter) => void;
}

function BillsTab({ filter, onFilterChange }: BillsTabProps) {
  const bills = trpc.landlord.bills.list.useQuery();
  const colors = useColors();

  // Apply the current filter to the bill list. Statuses on the server are:
  //   "draft" | "deployed" | "paid"
  // "Unpaid" is the user-facing alias for "deployed".
  const filtered = useMemo(() => {
    const list = bills.data ?? [];
    if (filter === "all") return list;
    if (filter === "unpaid") return list.filter((b) => b.status === "deployed");
    if (filter === "paid") return list.filter((b) => b.status === "paid");
    if (filter === "draft") return list.filter((b) => b.status === "draft");
    return list;
  }, [bills.data, filter]);

  // Per-status counts so each chip can show its quantity inline.
  // Counts come from the same `bills.data` source as the filtered list.
  const counts = useMemo(() => {
    const list = bills.data ?? [];
    return {
      all: list.length,
      unpaid: list.filter((b) => b.status === "deployed").length,
      paid: list.filter((b) => b.status === "paid").length,
      draft: list.filter((b) => b.status === "draft").length,
    };
  }, [bills.data]);

  /**
   * Compact pill chip: icon + label + count, fixed height so it never
   * stretches vertically when its parent has flex layout. Active state uses
   * the brand tint as background; inactive uses a subtle outlined surface.
   */
  const FilterChip = ({
    k,
    label,
    icon,
  }: {
    k: BillFilter;
    label: string;
    icon: React.ComponentProps<typeof IconSymbol>["name"];
  }) => {
    const active = filter === k;
    const count = counts[k];
    return (
      <Pressable
        onPress={() => onFilterChange(k)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={({ pressed }) => [
          {
            height: 36,
            paddingHorizontal: 14,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: active ? colors.tint : colors.border,
            backgroundColor: active ? colors.tint : colors.surface,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            // Light press feedback only — no transform that could distort the row.
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        <IconSymbol
          name={icon}
          size={14}
          color={active ? colors.background : colors.muted}
        />
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: active ? colors.background : colors.text,
          }}
        >
          {label}
        </Text>
        {count > 0 ? (
          <View
            style={{
              minWidth: 20,
              height: 18,
              paddingHorizontal: 6,
              borderRadius: 9,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: active ? colors.background + "33" : colors.tint + "1A",
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: active ? colors.background : colors.tint,
              }}
            >
              {count}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-xl font-bold text-foreground">Bills</Text>
        <Button title="New" icon="plus" onPress={() => router.push("/landlord/bills/new")} />
      </View>
      {/* Horizontal filter row — fixed height keeps chips as compact pills.
          The wrapper is intentionally NOT flex-1 so chips render at their
          natural row height instead of stretching vertically. */}
      <View style={{ height: 52, justifyContent: "center" }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            gap: 8,
            alignItems: "center",
          }}
        >
          <FilterChip k="all" label="All" icon="square.grid.2x2.fill" />
          <FilterChip k="unpaid" label="Unpaid" icon="clock.fill" />
          <FilterChip k="paid" label="Paid" icon="checkmark.circle.fill" />
          <FilterChip k="draft" label="Draft" icon="pencil" />
        </ScrollView>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(b) => String(b.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8 }}
        refreshControl={
          <RefreshControl refreshing={bills.isFetching} onRefresh={() => bills.refetch()} />
        }
        ListEmptyComponent={
          bills.isLoading ? (
            <ActivityIndicator className="mt-10" />
          ) : (
            <EmptyState
              icon="doc.text.fill"
              title={
                filter === "unpaid"
                  ? "No unpaid bills"
                  : filter === "paid"
                    ? "No paid bills yet"
                    : filter === "draft"
                      ? "No drafts"
                      : "No bills yet"
              }
              body={
                filter === "all"
                  ? "Tap New to create your first bill."
                  : "Switch filters above to see other bills."
              }
            />
          )
        }
        renderItem={({ item }) => (
          <Card
            onPress={() =>
              router.push({ pathname: "/landlord/bills/[id]", params: { id: String(item.id) } })
            }
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                  {(item as any).tenantName ||
                    (item as any).tenantEmail ||
                    `Tenant #${item.tenantId}`}
                </Text>
                <Text className="text-xs text-muted">
                  {formatBillPeriod(item.createdAt)} · #{item.id}
                </Text>
                {item.dueDate ? (
                  <Text className="text-xs text-muted">Due {formatDate(item.dueDate)}</Text>
                ) : null}
              </View>
              <View className="items-end gap-1">
                <Text className="text-base font-semibold text-foreground">
                  {formatPHP(item.totalAmount)}
                </Text>
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
        refreshControl={
          <RefreshControl refreshing={tenants.isFetching} onRefresh={() => tenants.refetch()} />
        }
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
          <Card
            onPress={() =>
              router.push({ pathname: "/landlord/tenants/[id]", params: { id: String(item.id) } })
            }
          >
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
                    router.push({
                      pathname: "/landlord/bills/new",
                      params: { tenantId: String(item.id) },
                    })
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
        refreshControl={
          <RefreshControl refreshing={convs.isFetching} onRefresh={() => convs.refetch()} />
        }
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
              router.push({
                pathname: "/landlord/chat/[id]",
                params: { id: String(item.id), name: item.tenant?.name ?? "Tenant" },
              })
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
