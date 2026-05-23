import { useEffect } from "react";
import { FlatList, Text, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Card, EmptyState, ScreenHeader } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";
import { relativeTime } from "@/lib/format";

export default function NotificationsScreen() {
  const list = trpc.landlord.notifications.list.useQuery();
  const utils = trpc.useUtils();
  const markAll = trpc.landlord.notifications.markAllRead.useMutation({
    onSuccess: () => utils.landlord.notifications.list.invalidate(),
  });

  // Auto-mark read on view
  useEffect(() => {
    const t = setTimeout(() => markAll.mutate(), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader title="Notifications" onBack={() => router.back()} />
      <FlatList
        data={list.data ?? []}
        keyExtractor={(n) => String(n.id)}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        ListEmptyComponent={
          <EmptyState icon="bell.fill" title="No notifications" body="You're all caught up." />
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
    </ScreenContainer>
  );
}
