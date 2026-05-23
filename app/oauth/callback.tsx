import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";

/**
 * Legacy OAuth callback stub. UtilityBill uses custom email/password auth,
 * so this route just redirects to the root which will route to the
 * appropriate role-based home.
 */
export default function OAuthCallback() {
  useEffect(() => {
    router.replace("/");
  }, []);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator />
    </View>
  );
}
