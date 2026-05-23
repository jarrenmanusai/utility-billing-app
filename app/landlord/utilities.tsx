import { useState } from "react";
import { Alert, FlatList, Modal, Text, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, Card, EmptyState, ScreenHeader, TextField } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";
import { formatPHP } from "@/lib/format";

export default function UtilitiesScreen() {
  const utils = trpc.useUtils();
  const list = trpc.landlord.utilities.list.useQuery();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [rate, setRate] = useState("");

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
    },
  });
  const update = trpc.landlord.utilities.update.useMutation({
    onSuccess: () => {
      utils.landlord.utilities.list.invalidate();
      setModalOpen(false);
      reset();
    },
  });
  const del = trpc.landlord.utilities.delete.useMutation({
    onSuccess: () => utils.landlord.utilities.list.invalidate(),
  });

  const save = () => {
    const r = parseFloat(rate);
    if (!name || !unit || isNaN(r) || r < 0) {
      Alert.alert("Missing info", "Please enter name, unit, and a valid rate.");
      return;
    }
    if (editingId) update.mutate({ id: editingId, name, unit, defaultRate: r });
    else create.mutate({ name, unit, defaultRate: r });
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader
        title="Utility types"
        onBack={() => router.back()}
      />
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
        renderItem={({ item }) => (
          <Card
            onPress={() => {
              setEditingId(item.id);
              setName(item.name);
              setUnit(item.unit);
              setRate(String(item.defaultRate));
              setModalOpen(true);
            }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">{item.name}</Text>
                <Text className="text-xs text-muted">{formatPHP(item.defaultRate)} / {item.unit}</Text>
              </View>
              <Button
                title="Delete"
                variant="danger"
                onPress={() =>
                  Alert.alert("Delete utility?", `Remove ${item.name}?`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => del.mutate({ id: item.id }) },
                  ])
                }
              />
            </View>
          </Card>
        )}
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
