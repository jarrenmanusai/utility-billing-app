import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, ScreenHeader, StatusBadge } from "@/components/ui/primitives";
import { BillReceipt } from "@/components/bill-receipt";
import { useConfirm, useToast } from "@/components/feedback";
import { trpc } from "@/lib/trpc";

export default function BillDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const billId = Number(id);
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const toast = useToast();

  const q = trpc.landlord.bills.detail.useQuery({ id: billId });

  const markPaid = trpc.landlord.bills.markPaid.useMutation({
    onSuccess: () => {
      utils.landlord.bills.detail.invalidate({ id: billId });
      utils.landlord.bills.list.invalidate();
      utils.landlord.stats.invalidate();
      toast("Bill marked as paid.", { variant: "success" });
    },
    onError: (e) => toast(e.message, { variant: "error" }),
  });

  const del = trpc.landlord.bills.delete.useMutation({
    onSuccess: () => {
      utils.landlord.bills.list.invalidate();
      toast("Bill deleted.", { variant: "success" });
      router.back();
    },
    onError: (e) => toast(e.message, { variant: "error" }),
  });

  const data = q.data;

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete bill?",
      message: "This cannot be undone. The tenant will lose access to this receipt.",
      destructive: true,
      confirmLabel: "Delete",
    });
    if (ok) del.mutate({ id: billId });
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader
        title={data ? `Receipt #${String(data.bill.id).padStart(6, "0")}` : "Bill"}
        subtitle={data?.tenant?.name ?? undefined}
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
              viewer="landlord"
            />

            <View style={{ gap: 8, marginTop: 4 }}>
              {data.bill.status === "draft" ? (
                <Button
                  title="Edit / deploy"
                  icon="pencil"
                  onPress={() =>
                    router.push({ pathname: "/landlord/bills/new", params: { id: String(billId) } })
                  }
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
                  onPress={handleDelete}
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
