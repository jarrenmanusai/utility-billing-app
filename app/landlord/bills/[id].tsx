import { Alert, Image, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, Card, ScreenHeader, StatusBadge } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";
import { formatDate, formatDateTime, formatPHP } from "@/lib/format";
import { getApiBaseUrl } from "@/constants/oauth";

export default function BillDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const billId = Number(id);
  const utils = trpc.useUtils();
  const q = trpc.landlord.bills.detail.useQuery({ id: billId });
  const utilities = trpc.landlord.utilities.list.useQuery();

  const markPaid = trpc.landlord.bills.markPaid.useMutation({
    onSuccess: () => {
      utils.landlord.bills.detail.invalidate({ id: billId });
      utils.landlord.bills.list.invalidate();
      utils.landlord.stats.invalidate();
    },
  });
  const del = trpc.landlord.bills.delete.useMutation({
    onSuccess: () => {
      utils.landlord.bills.list.invalidate();
      router.back();
    },
  });

  const data = q.data;
  const resolveUtility = (uid: number) => utilities.data?.find((u) => u.id === uid);
  const resolveUrl = (url?: string | null) =>
    url ? (url.startsWith("/") ? `${getApiBaseUrl()}${url}` : url) : "";

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader
        title={data ? `Bill #${data.bill.id}` : "Bill"}
        subtitle={data?.tenant?.name ?? undefined}
        onBack={() => router.back()}
        right={data ? <StatusBadge status={data.bill.status} /> : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {!data ? (
          <Text className="text-sm text-muted">Loading…</Text>
        ) : (
          <>
            <Card>
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm text-muted">Total</Text>
                <Text className="text-2xl font-bold text-primary">{formatPHP(data.bill.totalAmount)}</Text>
              </View>
              <Text className="text-xs text-muted">Created {formatDate(data.bill.createdAt)}</Text>
              {data.bill.dueDate ? (
                <Text className="text-xs text-muted">Due {formatDate(data.bill.dueDate)}</Text>
              ) : null}
              {data.bill.deployedAt ? (
                <Text className="text-xs text-muted">Deployed {formatDateTime(data.bill.deployedAt)}</Text>
              ) : null}
              {data.bill.paidAt ? (
                <Text className="text-xs text-muted">Paid {formatDateTime(data.bill.paidAt)}</Text>
              ) : null}
            </Card>

            <Card>
              <Text className="text-base font-semibold text-foreground mb-2">Items</Text>
              {data.items.map((it) => {
                const u = resolveUtility(it.utilityId);
                return (
                  <View key={it.id} className="border-b border-border py-2 last:border-b-0">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm font-semibold text-foreground">{u?.name ?? `Utility #${it.utilityId}`}</Text>
                      <Text className="text-sm font-semibold text-foreground">{formatPHP(it.amount)}</Text>
                    </View>
                    <Text className="text-xs text-muted">
                      {it.previousReading} → {it.currentReading} ({it.consumption} {u?.unit ?? ""}) @ {formatPHP(it.rate)}
                    </Text>
                  </View>
                );
              })}
            </Card>

            {data.bill.meterPhotoUrl ? (
              <Card>
                <Text className="text-base font-semibold text-foreground mb-2">Meter photo</Text>
                <Image
                  source={{ uri: resolveUrl(data.bill.meterPhotoUrl) }}
                  style={{ width: "100%", height: 220, borderRadius: 12 }}
                  resizeMode="cover"
                />
              </Card>
            ) : null}

            {data.bill.notes ? (
              <Card>
                <Text className="text-base font-semibold text-foreground mb-1">Notes</Text>
                <Text className="text-sm text-foreground">{data.bill.notes}</Text>
              </Card>
            ) : null}

            {data.payments.length > 0 ? (
              <Card>
                <Text className="text-base font-semibold text-foreground mb-2">Payment proofs</Text>
                {data.payments.map((p) => (
                  <View key={p.id} className="mb-3">
                    <Image
                      source={{ uri: resolveUrl(p.proofUrl) }}
                      style={{ width: "100%", height: 220, borderRadius: 12 }}
                      resizeMode="cover"
                    />
                    <Text className="text-xs text-muted mt-1">{formatDateTime(p.uploadedAt)}</Text>
                    {p.note ? <Text className="text-sm text-foreground mt-1">{p.note}</Text> : null}
                  </View>
                ))}
              </Card>
            ) : null}

            <View className="gap-2">
              {data.bill.status === "draft" ? (
                <Button
                  title="Edit / deploy"
                  icon="pencil"
                  onPress={() => router.push({ pathname: "/landlord/bills/new", params: { id: String(billId) } })}
                />
              ) : null}
              {data.bill.status === "deployed" ? (
                <Button
                  title="Mark as paid"
                  icon="checkmark"
                  onPress={() => markPaid.mutate({ id: billId })}
                  loading={markPaid.isPending}
                />
              ) : null}
              {data.bill.status !== "paid" ? (
                <Button
                  title="Delete bill"
                  icon="trash.fill"
                  variant="danger"
                  onPress={() =>
                    Alert.alert("Delete bill?", "This cannot be undone.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => del.mutate({ id: billId }) },
                    ])
                  }
                  loading={del.isPending}
                />
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
