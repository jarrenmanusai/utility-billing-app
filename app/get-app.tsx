import { Image, Linking, Platform, Text, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, Card, ScreenHeader } from "@/components/ui/primitives";
import { APP_VERSION } from "@/constants/app-version";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/format";

/**
 * Public download screen. The same screen serves three audiences:
 *
 *  - Signed-out visitors landing here from the launch page.
 *  - Existing users tapping the persistent "Update available" banner.
 *  - Existing users tapping a deployed `app_update` notification.
 *
 * For Android we open the APK URL directly via `Linking.openURL` (the OS
 * handles "open downloaded APK" / installer prompt). On iOS and the web
 * preview we show a clear hint that APK installation is Android-only and
 * give the user the URL so they can forward it to themselves.
 */
function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

export default function GetAppScreen() {
  const live = trpc.public.liveRelease.useQuery();

  const release = live.data;
  const newer = release ? compareSemver(release.version, APP_VERSION) > 0 : false;
  const isAndroid = Platform.OS === "android";

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
          <Text className="text-xs text-muted text-center mt-2">
            You are running v{APP_VERSION}
          </Text>
        </View>

        {release ? (
          <Card className="gap-2">
            <View className="flex-row items-center gap-2">
              <Text className="text-xs uppercase text-muted">Latest version</Text>
              {newer ? (
                <View className="px-2 py-0.5 rounded-full bg-primary">
                  <Text className="text-[10px] font-bold text-background">UPDATE</Text>
                </View>
              ) : null}
            </View>
            <Text className="text-lg font-semibold text-foreground">v{release.version}</Text>
            <Text className="text-xs text-muted">
              Published {formatDate(release.publishedAt ?? release.uploadedAt)}
            </Text>
            {release.notes ? (
              <Text className="text-sm text-foreground mt-1">{release.notes}</Text>
            ) : null}
            <View className="mt-3 gap-2">
              <Button
                title={isAndroid ? "Download APK" : "Open APK link"}
                icon="square.and.arrow.down"
                onPress={() => Linking.openURL(release.fileUrl)}
              />
              {!isAndroid ? (
                <Text className="text-xs text-muted">
                  APK installation is Android-only. On iOS or the web preview, this opens the
                  download URL so you can forward it to your Android device.
                </Text>
              ) : null}
              {!newer ? (
                <Text className="text-xs text-success">
                  You already have the latest version installed.
                </Text>
              ) : null}
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
