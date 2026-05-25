import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, Card, ScreenHeader, StatusBadge, TextField } from "@/components/ui/primitives";
import { BillReceipt } from "@/components/bill-receipt";
import { useToast } from "@/components/feedback";
import { trpc } from "@/lib/trpc";
import { pickImage, uploadImage } from "@/lib/upload";

export default function TenantBillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const billId = Number(id);
  const utils = trpc.useUtils();
  const toast = useToast();

  const q = trpc.tenant.bills.detail.useQuery({ id: billId });
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);

  const pay = trpc.tenant.bills.pay.useMutation({
    onSuccess: () => {
      utils.tenant.bills.detail.invalidate({ id: billId });
      utils.tenant.bills.list.invalidate();
      toast("Payment proof sent to your landlord.", { variant: "success" });
      setNote("");
    },
    onError: (err) => toast(err.message, { variant: "error" }),
  });

  const handlePay = async (source: "camera" | "library") => {
    const uri = await pickImage(source);
    if (!uri) return;
    setUploading(true);
    try {
      const url = await uploadImage(uri, "payment-proofs");
      pay.mutate({ billId, proofUrl: url, note: note || undefined });
    } catch (err: any) {
      toast(err?.message ?? "Upload failed. Try again.", { variant: "error" });
    } finally {
      setUploading(false);
    }
  };

  const data = q.data;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader
        title={data ? `Receipt #${String(data.bill.id).padStart(6, "0")}` : "Bill"}
        onBack={() => router.back()}
        right={data ? <StatusBadge status={data.bill.status} /> : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {!data ? (
          <Text className="text-sm text-muted">Loading…</Text>
        ) : (
          <>
            <BillReceipt
              bill={data.bill}
              items={data.items}
              landlord={data.landlord}
              tenant={data.tenant}
              payments={data.payments}
              viewer="tenant"
            />

            {data.bill.status !== "paid" ? (
              <Card>
                <Text className="text-base font-semibold text-foreground mb-2">
                  Upload payment proof
                </Text>
                <TextField
                  label="Note (optional)"
                  value={note}
                  onChangeText={setNote}
                  placeholder="e.g. paid via GCash"
                />
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
