import { Image, Linking, ScrollView, Text, View } from "react-native";
import { router, Stack } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Button, Card } from "@/components/ui/primitives";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { APP_AUTHOR, APP_NAME, APP_TAGLINE, APP_VERSION } from "@/constants/app-version";

/**
 * About screen — accessible from every role's Profile tab.
 * Reads from the single-source-of-truth constants in constants/app-version.ts so
 * the displayed version is always accurate after each deploy.
 */
export default function AboutScreen() {
  const colors = useColors();

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom header */}
      <View className="flex-row items-center gap-2 px-4 pt-2 pb-3 border-b border-border">
        <Button
          variant="ghost"
          icon="chevron.left"
          title=""
          onPress={() => router.back()}
        />
        <Text className="text-base font-bold text-foreground">About</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {/* Hero card */}
        <Card>
          <View className="items-center py-4 gap-3">
            <Image
              source={require("@/assets/images/icon.png")}
              style={{ width: 80, height: 80, borderRadius: 18 }}
            />
            <View className="items-center">
              <Text className="text-2xl font-bold text-foreground">{APP_NAME}</Text>
              <Text className="text-sm text-muted mt-1">{APP_TAGLINE}</Text>
            </View>
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: colors.tint + "1A",
              }}
            >
              <Text style={{ color: colors.tint, fontSize: 13, fontWeight: "600" }}>
                Version {APP_VERSION}
              </Text>
            </View>
          </View>
        </Card>

        {/* What's inside */}
        <Card>
          <Text className="text-base font-semibold text-foreground mb-2">What's inside</Text>
          <View className="gap-2">
            <FeatureRow icon="bolt.fill" label="Smart bill creation with OCR meter reading" />
            <FeatureRow icon="person.fill" label="Tenant management with one-tap billing" />
            <FeatureRow icon="bubble.left.and.bubble.right.fill" label="In-app chat with attachments" />
            <FeatureRow icon="checkmark.circle.fill" label="Payment proof review workflow" />
            <FeatureRow icon="bell.fill" label="Real-time notifications" />
          </View>
        </Card>

        {/* Credits */}
        <Card>
          <Text className="text-base font-semibold text-foreground mb-3">Credits</Text>
          <View className="items-center py-2 gap-2">
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: colors.tint + "1A",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: colors.tint, fontSize: 24, fontWeight: "700" }}>JW</Text>
            </View>
            <Text className="text-lg font-bold text-foreground">{APP_AUTHOR}</Text>
            <Text className="text-sm text-muted">Creator & Lead Designer</Text>
          </View>
        </Card>

        {/* Resources */}
        <Card>
          <Text className="text-base font-semibold text-foreground mb-2">Resources</Text>
          <View className="gap-2">
            <Button
              title="Privacy policy"
              icon="lock.fill"
              variant="secondary"
              onPress={() => Linking.openURL("https://example.com/privacy")}
            />
            <Button
              title="Terms of service"
              icon="doc.text.fill"
              variant="secondary"
              onPress={() => Linking.openURL("https://example.com/terms")}
            />
            <Button
              title="Contact support"
              icon="paperplane.fill"
              variant="secondary"
              onPress={() => Linking.openURL("mailto:support@utilityflow.app")}
            />
          </View>
        </Card>

        <Text className="text-xs text-muted text-center py-4">
          © 2026 {APP_NAME} · Made with care in the Philippines
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

function FeatureRow({ icon, label }: { icon: any; label: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: colors.tint + "14",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <IconSymbol name={icon} size={16} color={colors.tint} />
      </View>
      <Text className="text-sm text-foreground flex-1">{label}</Text>
    </View>
  );
}
