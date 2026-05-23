import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";

export type DashboardTab = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof IconSymbol>["name"];
  badge?: number;
};

export function DashboardTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: DashboardTab[];
  active: string;
  onChange: (key: string) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 8 : Math.max(insets.bottom, 8);

  return (
    <View
      className="flex-row items-stretch bg-background border-t border-border"
      style={{ paddingBottom: bottomPadding, paddingTop: 6 }}
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Pressable
            key={t.key}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.selectionAsync();
              onChange(t.key);
            }}
            style={({ pressed }) => [
              { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 6 },
              pressed && { opacity: 0.6 },
            ]}
          >
            <View style={{ position: "relative" }}>
              <IconSymbol
                name={t.icon}
                size={24}
                color={isActive ? colors.tint : colors.muted}
              />
              {t.badge && t.badge > 0 ? (
                <View
                  className="bg-error rounded-full items-center justify-center"
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -10,
                    minWidth: 16,
                    height: 16,
                    paddingHorizontal: 4,
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>
                    {t.badge > 99 ? "99+" : t.badge}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={{
                fontSize: 11,
                marginTop: 2,
                paddingHorizontal: 2,
                color: isActive ? colors.tint : colors.muted,
                fontWeight: isActive ? "600" : "500",
                textAlign: "center",
              }}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
