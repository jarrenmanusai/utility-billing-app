import { useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, Card, EmptyState, ScreenHeader, TextField } from "@/components/ui/primitives";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useConfirm, useToast } from "@/components/feedback";
import { trpc } from "@/lib/trpc";
import { formatPHP } from "@/lib/format";

export default function UtilitiesScreen() {
  const utils = trpc.useUtils();
  const colors = useColors();
  const toast = useToast();
  const confirm = useConfirm();
  const list = trpc.landlord.utilities.list.useQuery();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [rate, setRate] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const reset = () => {
    setEditingId(null);
    setName("");
    setUnit("");
    setRate("");
  };

  const create = trpc.landlord.utilities.create.useMutation({
    onSuccess: () => {
      utils.landlord.utilities.list.invalidate();
      setModalOpen(false);
      reset();
      toast("Utility added", { variant: "success" });
    },
    onError: (err) => toast(err.message ?? "Couldn't add utility", { variant: "error" }),
  });
  const update = trpc.landlord.utilities.update.useMutation({
    onSuccess: () => {
      utils.landlord.utilities.list.invalidate();
      setModalOpen(false);
      reset();
      toast("Utility updated", { variant: "success" });
    },
    onError: (err) => toast(err.message ?? "Couldn't update utility", { variant: "error" }),
  });
  const del = trpc.landlord.utilities.delete.useMutation({
    onSuccess: () => {
      utils.landlord.utilities.list.invalidate();
      toast("Utility deleted", { variant: "success" });
    },
    onError: (err) => toast(err.message ?? "Couldn't delete utility", { variant: "error" }),
    onSettled: () => setPendingDeleteId(null),
  });

  const save = () => {
    const r = parseFloat(rate);
    if (!name.trim() || !unit.trim() || isNaN(r) || r < 0) {
      toast("Please enter name, unit, and a valid rate", { variant: "error" });
      return;
    }
    if (editingId) update.mutate({ id: editingId, name: name.trim(), unit: unit.trim(), defaultRate: r });
    else create.mutate({ name: name.trim(), unit: unit.trim(), defaultRate: r });
  };

  const handleDelete = async (id: number, label: string) => {
    const ok = await confirm({
      title: "Delete utility?",
      message: `Remove "${label}"? Any bills already created with this utility will keep their values, but you won't be able to add new items for it.`,
      confirmLabel: "Delete",
      destructive: true,
      icon: "trash.fill",
    });
    if (!ok) return;
    setPendingDeleteId(id);
    del.mutate({ id });
  };

  const openEdit = (item: { id: number; name: string; unit: string; defaultRate: number | string }) => {
    setEditingId(item.id);
    setName(item.name);
    setUnit(item.unit);
    setRate(String(item.defaultRate));
    setModalOpen(true);
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader title="Utility types" onBack={() => router.back()} />
      <View className="px-4 py-3">
        <Button title="Add utility" icon="plus" onPress={() => { reset(); setModalOpen(true); }} />
      </View>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(u) => String(u.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 8 }}
        ListEmptyComponent={
          <EmptyState
            icon="bolt.fill"
            title="No utility types yet"
            body="Add the utilities you charge for, e.g. Electricity, Water, Internet."
          />
        }
        renderItem={({ item }) => {
          const isDeleting = pendingDeleteId === item.id && del.isPending;
          return (
            <Card>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <Pressable
                  onPress={() => openEdit(item)}
                  style={({ pressed }) => [
                    { flex: 1, minWidth: 0 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text className="text-xs text-muted" numberOfLines={1}>
                    {formatPHP(item.defaultRate)} / {item.unit}
                  </Text>
                </Pressable>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Pressable
                    onPress={() => openEdit(item)}
                    hitSlop={10}
                    style={({ pressed }) => [
                      {
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: colors.surface,
                      },
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <IconSymbol name="pencil" size={18} color={colors.text} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(item.id, item.name)}
                    hitSlop={10}
                    disabled={isDeleting}
                    style={({ pressed }) => [
                      {
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "rgba(239, 68, 68, 0.10)",
                        opacity: isDeleting ? 0.5 : 1,
                      },
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <IconSymbol name="trash.fill" size={18} color={colors.error} />
                  </Pressable>
                </View>
              </View>
            </Card>
          );
        }}
      />

      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
          <View className="bg-background rounded-t-3xl p-6 gap-3">
            <Text className="text-lg font-bold text-foreground">{editingId ? "Edit utility" : "New utility"}</Text>
            <TextField label="Name" value={name} onChangeText={setName} placeholder="Electricity" autoCapitalize="words" />
            <TextField label="Unit" value={unit} onChangeText={setUnit} placeholder="kWh" autoCapitalize="none" />
            <TextField label="Default rate (PHP)" value={rate} onChangeText={setRate} placeholder="12.50" keyboardType="decimal-pad" />
            <View className="flex-row gap-3 mt-2">
              <View style={{ flex: 1 }}>
                <Button title="Cancel" variant="secondary" onPress={() => { setModalOpen(false); reset(); }} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Save" onPress={save} loading={create.isPending || update.isPending} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
