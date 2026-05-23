import { useEffect, useMemo, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, Card, ScreenHeader, TextField } from "@/components/ui/primitives";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { formatPHP, parseNumber } from "@/lib/format";
import { pickImage, uploadImage } from "@/lib/upload";
import { getApiBaseUrl } from "@/constants/oauth";
import { useConfirm, useToast } from "@/components/feedback";

type LineItem = {
  utilityId: number | null;
  previousReading: string;
  currentReading: string;
  rate: string;
  prefilled: boolean;
};

export default function NewBillScreen() {
  const params = useLocalSearchParams<{ id?: string; tenantId?: string }>();
  const editId = params.id ? Number(params.id) : undefined;
  const utils = trpc.useUtils();
  const colors = useColors();
  const toast = useToast();
  const confirm = useConfirm();

  const tenants = trpc.landlord.tenants.list.useQuery();
  const utilities = trpc.landlord.utilities.list.useQuery();
  const existing = trpc.landlord.bills.detail.useQuery({ id: editId! }, { enabled: !!editId });

  const [tenantId, setTenantId] = useState<number | null>(params.tenantId ? Number(params.tenantId) : null);
  const [dueDate, setDueDate] = useState<string>("");
  const [meterPhotoUrl, setMeterPhotoUrl] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [ocr, setOcr] = useState<{ reading: number | null; amount: number | null; confidence: string } | null>(null);

  // Hydrate from existing bill (edit mode)
  useEffect(() => {
    if (existing.data) {
      setTenantId(existing.data.bill.tenantId);
      setDueDate(existing.data.bill.dueDate ? new Date(existing.data.bill.dueDate).toISOString().slice(0, 10) : "");
      setMeterPhotoUrl(existing.data.bill.meterPhotoUrl ?? "");
      setNotes(existing.data.bill.notes ?? "");
      setItems(
        existing.data.items.map((it) => ({
          utilityId: it.utilityId,
          previousReading: String(it.previousReading),
          currentReading: String(it.currentReading),
          rate: String(it.rate),
          prefilled: true,
        })),
      );
    }
  }, [existing.data]);

  // A2: when tenant changes (non-edit mode), reset previous readings so A1 can re-fill
  useEffect(() => {
    if (!editId) {
      setItems((prev) => prev.map((it) => ({ ...it, previousReading: "", prefilled: false })));
    }
  }, [tenantId, editId]);

  const ocrMutation = trpc.landlord.bills.ocrMeter.useMutation();
  const previousReadingQuery = trpc.useUtils().landlord.bills.previousReading;

  const fetchPrevForItem = async (idx: number, utilityId: number) => {
    if (!tenantId || !utilityId) return;
    try {
      const data = await previousReadingQuery.fetch({ tenantId, utilityId });
      if (data?.previousReading !== null && data?.previousReading !== undefined) {
        setItems((prev) =>
          prev.map((it, i) =>
            i === idx && !it.previousReading
              ? { ...it, previousReading: String(data.previousReading), prefilled: true }
              : it,
          ),
        );
      }
    } catch {}
  };

  const updateItem = (idx: number, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const addItem = () => {
    const firstUtility = utilities.data?.[0];
    const newItem: LineItem = {
      utilityId: firstUtility?.id ?? null,
      previousReading: "",
      currentReading: "",
      rate: firstUtility ? String(firstUtility.defaultRate) : "",
      prefilled: false,
    };
    setItems((prev) => [...prev, newItem]);
    if (tenantId && firstUtility) {
      setTimeout(() => fetchPrevForItem(items.length, firstUtility.id), 0);
    }
  };

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  // A3/A5/A6 live math
  const computed = useMemo(() => {
    const rows = items.map((it) => {
      const prev = parseNumber(it.previousReading);
      const curr = parseNumber(it.currentReading);
      const rate = parseNumber(it.rate);
      const consumption = Math.max(0, curr - prev);
      const amount = Math.round(consumption * rate * 100) / 100;
      return { consumption, amount };
    });
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return { rows, total: Math.round(total * 100) / 100 };
  }, [items]);

  const save = trpc.landlord.bills.save.useMutation({
    onSuccess: (_data, variables) => {
      utils.landlord.bills.list.invalidate();
      utils.landlord.stats.invalidate();
      toast(
        variables.status === "deployed" ? "Bill deployed to tenant" : "Draft saved",
        { variant: "success" },
      );
      router.back();
    },
    onError: (err) => toast(err.message ?? "Save failed", { variant: "error" }),
  });

  const submit = async (status: "draft" | "deployed") => {
    if (!tenantId) {
      toast("Please choose a tenant before saving", { variant: "error" });
      return;
    }
    if (items.length === 0) {
      toast("Add at least one bill item", { variant: "error" });
      return;
    }
    const invalid = items.find((it) => !it.utilityId || !it.currentReading || !it.rate);
    if (invalid) {
      toast("Each item needs a utility, current reading, and rate", { variant: "error", duration: 3500 });
      return;
    }

    if (status === "deployed") {
      const ok = await confirm({
        title: "Deploy bill?",
        message: `This will notify the tenant of a ${formatPHP(computed.total)} bill. They will be able to view and pay it immediately.`,
        confirmLabel: "Deploy",
        icon: "paperplane.fill",
      });
      if (!ok) return;
    }

    save.mutate({
      id: editId,
      tenantId,
      status,
      dueDate: dueDate || undefined,
      meterPhotoUrl: meterPhotoUrl || undefined,
      notes: notes || undefined,
      items: items.map((it) => ({
        utilityId: it.utilityId!,
        previousReading: parseNumber(it.previousReading),
        currentReading: parseNumber(it.currentReading),
        rate: parseNumber(it.rate),
      })),
    });
  };

  const attachPhoto = async (source: "camera" | "library") => {
    const uri = await pickImage(source);
    if (!uri) return;
    setUploading(true);
    try {
      const url = await uploadImage(uri, "meter-photos");
      setMeterPhotoUrl(url);
      const fullUrl = url.startsWith("/") ? `${getApiBaseUrl()}${url}` : url;
      const result = await ocrMutation.mutateAsync({ imageUrl: fullUrl });
      setOcr(result);
      if (result.reading != null && items.length > 0) {
        setItems((prev) =>
          prev.map((it, i) =>
            i === prev.length - 1 && !it.currentReading
              ? { ...it, currentReading: String(result.reading) }
              : it,
          ),
        );
        toast(`Meter read: ${result.reading} (${result.confidence})`, { variant: "success" });
      }
    } catch (err: any) {
      toast(err?.message ?? "Couldn't read meter — enter manually", { variant: "error", duration: 3500 });
    } finally {
      setUploading(false);
    }
  };

  const tenantList = tenants.data ?? [];
  const utilityList = utilities.data ?? [];
  const selectedTenant = tenantList.find((t) => t.id === tenantId);

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader title={editId ? "Edit bill" : "New bill"} onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          {/* Tenant selector — vertical list, always visible */}
          <Card>
            <Text className="text-sm font-semibold text-foreground mb-2">
              Tenant {selectedTenant ? `· ${selectedTenant.name ?? selectedTenant.email}` : ""}
            </Text>
            {tenantList.length === 0 ? (
              <Text className="text-xs text-muted">No tenants yet. Go to Tenants tab and add one first.</Text>
            ) : (
              <View className="gap-1.5">
                {tenantList.map((t) => {
                  const selected = tenantId === t.id;
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => setTenantId(t.id)}
                      style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                      className={`flex-row items-center justify-between rounded-xl border px-3 py-2.5 ${
                        selected ? "bg-primary/10 border-primary" : "bg-surface border-border"
                      }`}
                    >
                      <View className="flex-1">
                        <Text className={`text-sm font-semibold ${selected ? "text-primary" : "text-foreground"}`}>
                          {t.name ?? t.email}
                        </Text>
                        <Text className="text-xs text-muted">{t.email}</Text>
                      </View>
                      {selected ? (
                        <IconSymbol name="checkmark.circle.fill" size={22} color={colors.tint} />
                      ) : (
                        <View className="w-5 h-5 rounded-full border border-border" />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Card>

          {/* Meter photo + OCR */}
          <Card>
            <Text className="text-sm font-semibold text-foreground mb-2">Meter / Reference photo</Text>
            {meterPhotoUrl ? (
              <Image
                source={{ uri: meterPhotoUrl.startsWith("/") ? `${getApiBaseUrl()}${meterPhotoUrl}` : meterPhotoUrl }}
                style={{ width: "100%", height: 180, borderRadius: 12, marginBottom: 8 }}
                resizeMode="cover"
              />
            ) : null}
            <View className="flex-row gap-2">
              <View style={{ flex: 1 }}>
                <Button title="Camera" icon="camera.fill" variant="secondary" onPress={() => attachPhoto("camera")} loading={uploading} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Gallery" icon="photo.fill" variant="secondary" onPress={() => attachPhoto("library")} loading={uploading} />
              </View>
            </View>
            {ocr ? (
              <View className="mt-3 bg-primary/10 rounded-xl p-3 flex-row items-center gap-2">
                <IconSymbol name="sparkles" size={16} color={colors.tint} />
                <Text className="text-xs text-foreground flex-1">
                  OCR read{ocr.reading != null ? `: ${ocr.reading}` : " — no number detected"} · confidence {ocr.confidence}
                </Text>
              </View>
            ) : null}
          </Card>

          {/* Items */}
          <View>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-base font-semibold text-foreground">Bill items</Text>
              <Button
                title="Add item"
                icon="plus"
                variant="secondary"
                onPress={() => {
                  if (utilityList.length === 0) {
                    toast("Add a utility type first (Utilities tab)", { variant: "error", duration: 3500 });
                    return;
                  }
                  addItem();
                }}
              />
            </View>
            {items.length === 0 ? (
              <Card>
                <Text className="text-sm text-muted">
                  Tap &quot;Add item&quot; above to charge for a utility (e.g. Electricity, Water).
                </Text>
              </Card>
            ) : null}
            {items.map((it, idx) => {
              const utility = utilityList.find((u) => u.id === it.utilityId);
              const c = computed.rows[idx];
              return (
                <Card key={idx} className="mb-2">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-sm font-semibold text-foreground">
                      Item {idx + 1}
                      {utility ? ` · ${utility.name}` : ""}
                    </Text>
                    <Pressable hitSlop={8} onPress={() => removeItem(idx)}>
                      <IconSymbol name="trash.fill" size={18} color={colors.error} />
                    </Pressable>
                  </View>

                  {/* Utility picker — explicit list */}
                  <Text className="text-xs font-medium text-muted mb-1.5">Utility type</Text>
                  {utilityList.length === 0 ? (
                    <Text className="text-xs text-muted mb-2">
                      No utility types yet. Add one in the Utilities tab.
                    </Text>
                  ) : (
                    <View className="flex-row flex-wrap gap-1.5 mb-2">
                      {utilityList.map((u) => {
                        const selected = it.utilityId === u.id;
                        return (
                          <Pressable
                            key={u.id}
                            onPress={() => {
                              updateItem(idx, { utilityId: u.id, rate: String(u.defaultRate) });
                              fetchPrevForItem(idx, u.id);
                            }}
                            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                            className={`px-3 py-1.5 rounded-full border ${
                              selected ? "bg-primary border-primary" : "bg-surface border-border"
                            }`}
                          >
                            <Text className={`text-xs font-semibold ${selected ? "text-white" : "text-foreground"}`}>
                              {u.name} ({u.unit})
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  <View className="flex-row gap-2 mt-1">
                    <View style={{ flex: 1 }}>
                      <TextField
                        label="Previous"
                        value={it.previousReading}
                        onChangeText={(v) => updateItem(idx, { previousReading: v, prefilled: false })}
                        keyboardType="decimal-pad"
                        hint={it.prefilled ? "Prefilled from last bill" : undefined}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <TextField
                        label="Current"
                        value={it.currentReading}
                        onChangeText={(v) => updateItem(idx, { currentReading: v })}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>

                  <View className="flex-row gap-2 mt-2">
                    <View style={{ flex: 1 }}>
                      <TextField
                        label={`Rate ${utility ? `(per ${utility.unit})` : ""}`}
                        value={it.rate}
                        onChangeText={(v) => updateItem(idx, { rate: v })}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={{ flex: 1, justifyContent: "flex-end" }}>
                      <View className="bg-surface rounded-xl border border-border px-3 py-2.5">
                        <Text className="text-xs text-muted">Consumption</Text>
                        <Text className="text-base font-semibold text-foreground">
                          {c?.consumption ?? 0} {utility?.unit ?? ""}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View className="bg-primary/5 rounded-xl px-3 py-2 mt-2 flex-row items-center justify-between">
                    <Text className="text-xs text-muted">Amount</Text>
                    <Text className="text-base font-bold text-primary">{formatPHP(c?.amount ?? 0)}</Text>
                  </View>
                </Card>
              );
            })}
          </View>

          {/* Total */}
          <Card>
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">Total</Text>
              <Text className="text-2xl font-bold text-primary">{formatPHP(computed.total)}</Text>
            </View>
          </Card>

          {/* Misc */}
          <TextField
            label="Due date (optional, YYYY-MM-DD)"
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="2026-06-15"
            autoCapitalize="none"
          />
          <TextField
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Any remarks for the tenant"
            multiline
          />

          {/* Actions */}
          <View className="flex-row gap-2 mt-2">
            <View style={{ flex: 1 }}>
              <Button title="Save draft" variant="secondary" onPress={() => submit("draft")} loading={save.isPending} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Deploy" icon="paperplane.fill" onPress={() => submit("deployed")} loading={save.isPending} />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
