import { Image, Linking, Text, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, Card, ScreenHeader } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/format";

export default function GetAppScreen() {
  const live = trpc.public.liveRelease.useQuery();

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader title="Get the app" onBack={() => router.back()} />
      <View className="p-6 gap-5">
        <View className="items-center mt-2">
          <Image
            source={require("@/assets/images/icon.png")}
            style={{ width: 96, height: 96, borderRadius: 22 }}
          />
          <Text className="text-2xl font-bold text-foreground mt-3">UtilityFlow</Text>
          <Text className="text-sm text-muted text-center mt-1">
            Smart utility billing for landlords and tenants.
          </Text>
        </View>

        {live.data ? (
          <Card className="gap-2">
            <Text className="text-xs uppercase text-muted">Latest version</Text>
            <Text className="text-lg font-semibold text-foreground">v{live.data.version}</Text>
            <Text className="text-xs text-muted">Published {formatDate(live.data.publishedAt)}</Text>
            {live.data.notes ? (
              <Text className="text-sm text-foreground mt-1">{live.data.notes}</Text>
            ) : null}
            <View className="mt-3">
              <Button
                title="Download APK"
                icon="square.and.arrow.down"
                onPress={() => Linking.openURL(live.data!.fileUrl)}
              />
            </View>
          </Card>
        ) : (
          <Card>
            <Text className="text-sm text-muted">No release available yet.</Text>
          </Card>
        )}
      </View>
    </ScreenContainer>
  );
}
