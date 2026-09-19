import React, { useEffect } from "react";
import { View, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AppText, Card, Header, Loading, EmptyState, spacing, radius } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";

const ICONS: Record<string, string> = { request: "briefcase-outline", message: "chatbubble-outline", note: "megaphone-outline", discount: "pricetag-outline" };

export default function Notifications() {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api.get("/notifications") });

  useEffect(() => {
    api.post("/notifications/read-all").then(() => {
      qc.invalidateQueries({ queryKey: ["unread-count"] });
    });
  }, [qc]);

  const Row = require("@react-native-vector-icons/ionicons").default;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Header title={t("notifications")} back />
      {q.isLoading ? <Loading /> : (
        <FlatList
          data={q.data || []}
          keyExtractor={(i: any) => i.id}
          onRefresh={() => q.refetch()}
          refreshing={q.isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["3xl"] }}
          ListEmptyComponent={<EmptyState icon="notifications-outline" text={t("noNotifications")} />}
          renderItem={({ item }) => (
            <Card
              testID={`notif-${item.id}`}
              onPress={item.type === "request" || item.type === "message" ? () => router.push(`/chat/${item.ref_id}`) : undefined}
              style={{ padding: spacing.md }}
            >
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: spacing.md }}>
                <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}>
                  <Row name={ICONS[item.type] || "notifications-outline"} size={20} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText weight="bold" size="base">{item.title}</AppText>
                  <AppText size="sm" color={colors.muted} numberOfLines={2}>{item.body}</AppText>
                </View>
                {!item.read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} /> : null}
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}
