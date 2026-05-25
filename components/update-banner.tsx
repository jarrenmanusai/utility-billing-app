import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { APP_VERSION } from "@/constants/app-version";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

/**
 * Persistent in-app banner that surfaces when the admin has deployed a newer
 * APK version than the one currently bundled. Uses `public.liveRelease` so it
 * works for both signed-in and signed-out users.
 *
 * Behavior:
 * - Polls every 60 seconds in case the admin deploys while a user is active.
 * - Only renders when `liveRelease.version > APP_VERSION` (semver-aware
 *   compare). Same or older versions never show the banner.
 * - Tap "Update" to either deep-link into `/get-app` (which can open the APK)
 *   or, on Android, open the APK URL directly via `Linking.openURL`.
 * - Tap the dismiss icon to suppress this version locally; the banner reappears
 *   for the next deployed version automatically.
 * - Hides itself on the `/get-app` and `/login`/`/register`/`/reset` screens
 *   so it doesn't double up with that dedicated download UI or interrupt
 *   onboarding.
 */
const DISMISSED_KEY = "utilitybill.update.dismissedVersion";

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

export function UpdateBanner() {
  const colors = useColors();
  const pathname = usePathname();
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  // 60-second poll. Never throws on offline — query simply stays empty.
  const live = trpc.public.liveRelease.useQuery(undefined, {
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((v) => setDismissedVersion(v))
      .catch(() => setDismissedVersion(null));
  }, []);

  const release = live.data;
  if (!release) return null;

  const liveVersion = String(release.version || "").trim();
  if (!liveVersion) return null;
  if (compareSemver(liveVersion, APP_VERSION) <= 0) return null;
  if (dismissedVersion === liveVersion) return null;

  // Don't double up with the dedicated download screen or block onboarding.
  const path = pathname || "";
  if (
    path === "/get-app" ||
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/reset") ||
    path === "/"
  ) {
    return null;
  }

  const onUpdate = () => {
    if (Platform.OS === "android" && release.fileUrl) {
      Linking.openURL(release.fileUrl).catch(() => router.push("/get-app"));
      return;
    }
    router.push("/get-app");
  };

  const onDismiss = async () => {
    setDismissedVersion(liveVersion);
    try {
      await AsyncStorage.setItem(DISMISSED_KEY, liveVersion);
    } catch {
      // best-effort; banner already hidden in memory
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: Platform.OS === "web" ? 16 : 80,
        zIndex: 60,
      }}
    >
      <View
        style={{
          backgroundColor: colors.primary,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "rgba(255,255,255,0.22)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconSymbol name="arrow.down.app.fill" size={20} color="#ffffff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 14 }}>
            Update available · v{liveVersion}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.86)", fontSize: 12 }} numberOfLines={2}>
            {release.notes
              ? String(release.notes).slice(0, 90) + (String(release.notes).length > 90 ? "…" : "")
              : "A new version of UtilityFlow is ready to install."}
          </Text>
        </View>
        <Pressable
          onPress={onUpdate}
          style={({ pressed }) => [
            {
              opacity: pressed ? 0.85 : 1,
              backgroundColor: "rgba(255,255,255,0.2)",
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 10,
            },
          ]}
          accessibilityLabel="Open update"
        >
          <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 13 }}>Update</Text>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          style={({ pressed }) => [
            {
              opacity: pressed ? 0.6 : 1,
              width: 28,
              height: 28,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
            },
          ]}
          accessibilityLabel="Dismiss update banner"
        >
          <IconSymbol name="xmark" size={14} color="#ffffff" />
        </Pressable>
      </View>
    </View>
  );
}
