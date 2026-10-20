import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "@/src/api";

export async function registerForPush(userId: string) {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await api.post("/register-push", {
      user_id: userId,
      platform: Platform.OS,
      device_token: String(tokenResp.data),
    });
  } catch {
    // non-blocking
  }
}
