import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "@/src/auth";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FAFAFA" }}>
        <ActivityIndicator size="large" color="#046C4E" />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;
  if (user.role === "admin") return <Redirect href="/(admin)" />;
  if (user.role === "service_provider") return <Redirect href="/(provider)" />;
  return <Redirect href="/(customer)" />;
}
