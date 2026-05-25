import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";

import { Card } from "@/components/ui/primitives";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { relativeTime } from "@/lib/format";

/**
 * Notification row used by both landlord and tenant Alerts screens.
 *
 * Tapping a row deep-links to the relevant screen based on the notification
 * `type` and JSON `payload`, and triggers `onMarkRead(id)` so the row's blue
 * dot disappears immediately. The "Mark read" affordance is also exposed as a
 * dedicated icon button so users don't have to navigate away just to clear a
 * single alert.
 */
export type NotificationItem = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  payload: string | null;
  readAt: Date | string | null;
  createdAt: Date | string;
};

export type NotificationRole = "landlord" | "tenant";

export interface NotificationRowProps {
  item: NotificationItem;
  role: NotificationRole;
  onMarkRead: (id: number) => void;
}

/** Pull a typed payload out of the JSON-encoded `payload` column. */
function parsePayload(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Compute the deep-link target for a notification. Returns null if the type
 * has no associated route (e.g. `account_approved` is informational only).
 */
function destinationFor(item: NotificationItem, role: NotificationRole): string | null {
  const payload = parsePayload(item.payload);
  switch (item.type) {
    case "chat_message": {
      const cid = payload.conversationId;
      if (role === "landlord" && typeof cid === "number") {
        return `/landlord/chat/${cid}`;
      }
      // Tenant has a single conversation surfaced via the in-app Chat tab.
      // Use the dashboard route with a `?tab=chat` query so the tab opens.
      return role === "tenant" ? "/tenant?tab=chat" : null;
    }
    case "bill_deployed":
    case "payment_verified": {
      const id = payload.billId;
      if (role === "tenant" && typeof id === "number") return `/tenant/bills/${id}`;
      return null;
    }
    case "payment_uploaded": {
      const id = payload.billId;
      if (role === "landlord" && typeof id === "number") return `/landlord/bills/${id}`;
      return null;
    }
    default:
      return null;
  }
}

/** Pick a leading icon by notification type so the list scans quickly. */
function iconFor(type: string): "bell.fill" | "envelope.fill" | "doc.text.fill" | "checkmark.seal.fill" {
  switch (type) {
    case "chat_message":
      return "envelope.fill";
    case "bill_deployed":
    case "payment_uploaded":
      return "doc.text.fill";
    case "payment_verified":
    case "account_approved":
      return "checkmark.seal.fill";
    default:
      return "bell.fill";
  }
}

export function NotificationRow({ item, role, onMarkRead }: NotificationRowProps) {
  const colors = useColors();
  const isUnread = !item.readAt;
  const dest = destinationFor(item, role);
  const tappable = dest !== null;

  const handlePress = () => {
    if (isUnread) onMarkRead(item.id);
    if (dest) router.push(dest as any);
  };

  const handleMarkRead = () => {
    if (isUnread) onMarkRead(item.id);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        { opacity: pressed && tappable ? 0.7 : 1 },
      ]}
    >
      <Card>
        <View className="flex-row items-start gap-3">
          {/* Unread dot — keeps existing visual language. */}
          <View
            className="w-2 h-2 rounded-full mt-2"
            style={{ backgroundColor: isUnread ? colors.primary : "transparent" }}
          />
          {/* Type icon for fast scanning. */}
          <View
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ backgroundColor: colors.surface }}
          >
            <IconSymbol name={iconFor(item.type)} size={18} color={colors.muted} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground">{item.title}</Text>
            {item.body ? (
              <Text className="text-sm text-muted mt-0.5">{item.body}</Text>
            ) : null}
            <View className="flex-row items-center gap-2 mt-1">
              <Text className="text-xs text-muted">{relativeTime(item.createdAt)}</Text>
              {tappable ? (
                <Text className="text-xs font-medium" style={{ color: colors.primary }}>
                  · Tap to open
                </Text>
              ) : null}
            </View>
          </View>
          {/* Per-row mark-read affordance. Only rendered when unread so the
              row stays calm once cleared. Stops propagation so tapping the
              checkmark doesn't also navigate. */}
          {isUnread ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                handleMarkRead();
              }}
              hitSlop={8}
              accessibilityLabel="Mark as read"
              style={({ pressed }) => [
                {
                  opacity: pressed ? 0.6 : 1,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.surface,
                },
              ]}
            >
              <IconSymbol name="checkmark" size={16} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}
