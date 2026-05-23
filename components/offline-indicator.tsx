import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";

/** Sticky offline toast at the top of the screen. */
export function OfflineIndicator() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (Platform.OS !== "web") {
      // For native, we'd use @react-native-community/netinfo. Since we don't have it,
      // fall back to a periodic API ping.
      let cancelled = false;
      const tick = async () => {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 4000);
          await fetch("https://www.google.com/generate_204", { signal: ctrl.signal });
          clearTimeout(t);
          if (!cancelled) setOnline(true);
        } catch {
          if (!cancelled) setOnline(false);
        }
      };
      tick();
      const interval = setInterval(tick, 15000);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }
    const update = () => setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    update();
    if (typeof window !== "undefined") {
      window.addEventListener("online", update);
      window.addEventListener("offline", update);
      return () => {
        window.removeEventListener("online", update);
        window.removeEventListener("offline", update);
      };
    }
  }, []);

  if (online) return null;

  return (
    <View
      pointerEvents="none"
      className="absolute top-0 left-0 right-0 z-50 bg-warning py-1 items-center"
      style={{ paddingTop: 28 }}
    >
      <Text className="text-xs font-semibold text-white">You are offline</Text>
    </View>
  );
}
