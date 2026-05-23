import { useState } from "react";
import { Alert, Image, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, Card, ScreenHeader, StatusBadge, TextField } from "@/components/ui/primitives";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { formatDate, formatDateTime, formatPHP } from "@/lib/format";
import { pickImage, uploadImage } from "@/lib/upload";
import { getApiBaseUrl } from "@/constants/oauth";

export default function TenantBillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const billId = Number(id);
  const utils = trpc.useUtils();
  const colors = useColors();

  const q = trpc.tenant.bills.detail.useQuery({ id: billId });
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);

  const pay = trpc.tenant.bills.pay.useMutation({
    onSuccess: () => {
      utils.tenant.bills.detail.invalidate({ id: billId });
      utils.tenant.bills.list.invalidate();
      Alert.alert("Submitted", "Your payment proof has been sent to your landlord.");
      setNote("");
    },
    onError: (err) => Alert.alert("Error", err.message),
  });

  const handlePay = async (source: "camera" | "library") => {
    const uri = await pickImage(source);
    if (!uri) return;
    setUploading(true);
    try {
      const url = await uploadImage(uri, "payment-proofs");
      pay.mutate({ billId, proofUrl: url, note: note || undefined });
    } catch (err: any) {
      Alert.alert("Upload failed", err?.message ?? "Try again.");
    } finally {
      setUploading(false);
    }
  };

  const resolveUrl = (url?: string | null) =>
    url ? (url.startsWith("/") ? `${getApiBaseUrl()}${url}` : url) : "";

  const data = q.data;
  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader
        title={data ? `Bill #${data.bill.id}` : "Bill"}
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
                <Text className="text-sm text-muted">Total due</Text>
                <Text className="text-2xl font-bold text-primary">{formatPHP(data.bill.totalAmount)}</Text>
              </View>
              {data.bill.dueDate ? <Text className="text-xs text-muted">Due {formatDate(data.bill.dueDate)}</Text> : null}
              {data.bill.deployedAt ? (
                <Text className="text-xs text-muted">Issued {formatDateTime(data.bill.deployedAt)}</Text>
              ) : null}
              {data.bill.paidAt ? (
                <Text className="text-xs text-success">Confirmed paid {formatDateTime(data.bill.paidAt)}</Text>
              ) : null}
            </Card>

            <Card>
              <Text className="text-base font-semibold text-foreground mb-2">Breakdown</Text>
              {data.items.map((it) => (
                <View key={it.id} className="border-b border-border py-2 last:border-b-0">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-foreground">
                      {it.utility?.name ?? `Utility #${it.utilityId}`}
                    </Text>
                    <Text className="text-sm font-semibold text-foreground">{formatPHP(it.amount)}</Text>
                  </View>
                  <Text className="text-xs text-muted">
                    {it.previousReading} → {it.currentReading} ({it.consumption} {it.utility?.unit ?? ""}) @ {formatPHP(it.rate)}
                  </Text>
                </View>
              ))}
            </Card>

            {data.bill.meterPhotoUrl ? (
              <Card>
                <Text className="text-base font-semibold text-foreground mb-2">Reference photo</Text>
                <Image
                  source={{ uri: resolveUrl(data.bill.meterPhotoUrl) }}
                  style={{ width: "100%", height: 220, borderRadius: 12 }}
                  resizeMode="cover"
                />
              </Card>
            ) : null}

            {data.bill.notes ? (
              <Card>
                <Text className="text-base font-semibold text-foreground mb-1">Notes from landlord</Text>
                <Text className="text-sm text-foreground">{data.bill.notes}</Text>
              </Card>
            ) : null}

            {data.payments.length > 0 ? (
              <Card>
                <Text className="text-base font-semibold text-foreground mb-2">Your payment proofs</Text>
                {data.payments.map((p) => (
                  <View key={p.id} className="mb-3">
                    <Image
                      source={{ uri: resolveUrl(p.proofUrl) }}
                      style={{ width: "100%", height: 220, borderRadius: 12 }}
                      resizeMode="cover"
                    />
                    <Text className="text-xs text-muted mt-1">Sent {formatDateTime(p.uploadedAt)}</Text>
                    {p.note ? <Text className="text-sm text-foreground mt-1">{p.note}</Text> : null}
                  </View>
                ))}
              </Card>
            ) : null}

            {data.bill.status !== "paid" ? (
              <Card>
                <Text className="text-base font-semibold text-foreground mb-2">Upload payment proof</Text>
                <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. paid via GCash" />
                <View className="h-3" />
                <View className="flex-row gap-2">
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Camera"
                      icon="camera.fill"
                      onPress={() => handlePay("camera")}
                      loading={uploading || pay.isPending}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Gallery"
                      icon="photo.fill"
                      variant="secondary"
                      onPress={() => handlePay("library")}
                      loading={uploading || pay.isPending}
                    />
                  </View>
                </View>
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
