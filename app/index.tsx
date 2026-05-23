import { useEffect } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { router } from "expo-router";

import { useAuth } from "@/lib/auth-context";
import { ScreenContainer } from "@/components/screen-container";

export default function IndexScreen() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role === "landlord") router.replace("/landlord");
    else if (user.role === "tenant") router.replace("/tenant");
    else if (user.role === "admin") router.replace("/admin");
    else router.replace("/login");
  }, [user, loading]);

  return (
    <ScreenContainer>
      <View className="flex-1 items-center justify-center gap-4">
        <Image
          source={require("@/assets/images/icon.png")}
          style={{ width: 88, height: 88, borderRadius: 20 }}
        />
        <Text className="text-2xl font-bold text-foreground">UtilityFlow</Text>
        <ActivityIndicator />
      </View>
    </ScreenContainer>
  );
}
