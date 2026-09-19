import React from "react";
import { Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { themes } from "@/src/theme";

const c = themes.light;

export function tabScreenOptions() {
  return {
    headerShown: false,
    tabBarActiveTintColor: c.brandPrimary,
    tabBarInactiveTintColor: c.muted,
    tabBarStyle: {
      backgroundColor: c.surfaceSecondary,
      borderTopColor: c.border,
      borderTopWidth: 1,
      ...(Platform.OS === "web" ? { height: 64 } : {}),
      paddingTop: 6,
    },
    tabBarItemStyle: { alignSelf: "center" as const },
    tabBarLabelStyle: { fontFamily: "Tajawal-Medium", fontSize: 11 },
  };
}

export function tabIcon(name: string) {
  return ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name as any} size={size ?? 22} color={color} />
  );
}
