import React from "react";
import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { radius } from "@/src/theme";

export default function NotificationBell({ onDark }: { onDark?: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  const q = useQuery({ queryKey: ["unread-count"], queryFn: () => import("@/src/api").then((m) => m.api.get("/notifications/unread-count")), refetchInterval: 8000 });
  const count = q.data?.count ?? 0;

  return (
    <Pressable
      testID="notification-bell"
      onPress={() => { haptic("light"); router.push("/notifications"); }}
      style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: onDark ? "#FFFFFF22" : colors.brandTertiary, alignItems: "center", justifyContent: "center" }}
    >
      <Ionicons name="notifications-outline" size={22} color={onDark ? "#FFFFFF" : colors.accent} />
      {count > 0 ? (
        <View testID="notification-badge" style={{ position: "absolute", top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
          <AppText color="#FFFFFF" size="sm" weight="bold" style={{ fontSize: 10, lineHeight: 14 }}>{count > 9 ? "9+" : count}</AppText>
        </View>
      ) : null}
    </Pressable>
  );
}
