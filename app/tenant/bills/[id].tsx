import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, Card, EmptyState, ScreenHeader, StatusBadge, TextField } from "@/components/ui/primitives";
import { BillReceipt } from "@/components/bill-receipt";
import { useToast } from "@/components/feedback";
import { trpc } from "@/lib/trpc";
import { pickImage, uploadImage } from "@/lib/upload";
import { shareReceipt } from "@/lib/receipt-export";

/**
 * Tenant bill detail / receipt screen.
 *
 * Three rendering states are handled explicitly:
 *  1. Loading — query in flight, never seen before
 *  2. Not-found — bill was deleted or revoked by the landlord; previously
 *     this got stuck on "Loading…" forever because we only branched on
 *     `q.data` and ignored `q.isError`. Now we surface a clear empty state
 *     with a "Back to alerts" action.
 *  3. Loaded — full receipt + payment-proof composer (when unpaid) +
 *     download/share button.
 */
export default function TenantBillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const billId = Number(id);
  const utils = trpc.useUtils();
  const toast = useToast();

  const q = trpc.tenant.bills.detail.useQuery(
    { id: billId },
    {
      // Don't keep retrying NOT_FOUND — that's the deleted-bill case and
      // retrying just makes the spinner sit longer.
      retry: (failureCount, err: any) => {
        if (err?.data?.code === "NOT_FOUND") return false;
        return failureCount < 2;
      },
    },
  );

  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  const handleDownload = async () => {
    if (!q.data) return;
    setExporting(true);
    try {
      await shareReceipt({
        bill: q.data.bill,
        items: q.data.items,
        landlord: q.data.landlord,
        tenant: q.data.tenant,
        payments: q.data.payments,
      });
    } catch (err: any) {
      toast(err?.message ?? "Couldn't generate the receipt.", { variant: "error" });
    } finally {
      setExporting(false);
    }
  };

  // --- Render ---
  // Distinguish between loading (no data yet, no error) and not-found
  // (server returned NOT_FOUND because the bill was deleted, the tenant
  // was reassigned, or the bill is still draft and isn't visible).
  const data = q.data;
  const isNotFound = q.isError && (q.error?.data as { code?: string } | undefined)?.code === "NOT_FOUND";

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader
        title={data ? `Receipt #${String(data.bill.id).padStart(6, "0")}` : "Bill"}
        onBack={() => router.back()}
        right={data ? <StatusBadge status={data.bill.status} /> : undefined}
      />

      {isNotFound ? (
        <EmptyState
          icon="exclamationmark.triangle.fill"
          title="Bill no longer available"
          body="Your landlord deleted or revoked this bill. The alert can be safely dismissed — there's nothing you need to pay here."
          action={
            <View className="flex-row gap-2">
              <Button title="Back to alerts" icon="arrow.left" onPress={() => router.back()} />
            </View>
          }
        />
      ) : !data ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm text-muted">Loading…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <BillReceipt
            bill={data.bill}
            items={data.items}
            landlord={data.landlord}
            tenant={data.tenant}
            payments={data.payments}
            viewer="tenant"
          />

          <Button
            title="Download / share receipt"
            icon="square.and.arrow.up"
            variant="secondary"
            onPress={handleDownload}
            loading={exporting}
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
        </ScrollView>
      )}
    </ScreenContainer>
  );
}
