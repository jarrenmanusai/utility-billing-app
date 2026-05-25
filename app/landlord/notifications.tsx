import { FlatList, Text, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, EmptyState, ScreenHeader } from "@/components/ui/primitives";
import { NotificationRow } from "@/components/notification-row";
import { trpc } from "@/lib/trpc";

/**
 * Landlord Alerts/Notifications screen.
 *
 * Each row is tappable: chat_message → conversation, payment_uploaded →
 * landlord bill detail. Rows also expose a dedicated checkmark to mark a
 * single alert read without using the bulk "Mark all read" action — based on
 * direct user feedback that bulk-clearing felt all-or-nothing.
 */
export default function NotificationsScreen() {
  const list = trpc.landlord.notifications.list.useQuery();
  const utils = trpc.useUtils();

  const markAll = trpc.landlord.notifications.markAllRead.useMutation({
    onSuccess: () => utils.landlord.notifications.list.invalidate(),
  });

  const markOne = trpc.landlord.notifications.markOneRead.useMutation({
    // Optimistic: flip readAt locally so the UI clears the dot instantly.
    onMutate: async ({ id }) => {
      await utils.landlord.notifications.list.cancel();
      const prev = utils.landlord.notifications.list.getData();
      if (prev) {
        utils.landlord.notifications.list.setData(
          undefined,
          prev.map((n) => (n.id === id ? { ...n, readAt: new Date() } : n)),
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.landlord.notifications.list.setData(undefined, ctx.prev);
    },
    onSettled: () => utils.landlord.notifications.list.invalidate(),
  });

  const hasUnread = (list.data ?? []).some((n) => !n.readAt);

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader title="Notifications" onBack={() => router.back()} />
      <View className="flex-row items-center justify-between px-4 py-2">
        <Text className="text-xs text-muted">
          {hasUnread ? "Tap any alert to open it, or use the checkmark to clear." : "All caught up."}
        </Text>
        {hasUnread ? (
          <Button
            title="Mark all read"
            variant="secondary"
            onPress={() => markAll.mutate()}
            loading={markAll.isPending}
          />
        ) : null}
      </View>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(n) => String(n.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 8 }}
        ListEmptyComponent={
          <EmptyState icon="bell.fill" title="No notifications" body="You're all caught up." />
        }
        renderItem={({ item }) => (
          <NotificationRow
            item={item}
            role="landlord"
            onMarkRead={(id) => markOne.mutate({ id })}
          />
        )}
      />
    </ScreenContainer>
  );
}
