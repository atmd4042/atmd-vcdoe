import React from "react";
import { View, FlatList, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, Card, StatusBadge, Header, Loading, EmptyState, spacing, radius, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";

export default function AdminRequests() {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-requests"], queryFn: () => api.get("/admin/requests") });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/admin/requests/${id}`),
    onSuccess: () => { haptic("success"); Toast.show({ type: "success", text1: t("saved") }); qc.invalidateQueries({ queryKey: ["admin-requests"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); },
    onError: (e: any) => Toast.show({ type: "error", text1: e.message }),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Header title={t("viewChats")} back />
      {q.isLoading ? <Loading /> : (
        <FlatList
          data={q.data || []}
          keyExtractor={(i: any) => i.id}
          onRefresh={() => q.refetch()}
          refreshing={q.isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["3xl"] }}
          ListEmptyComponent={<EmptyState icon="chatbubbles-outline" text={t("noRequests")} />}
          renderItem={({ item }) => (
            <Card testID={`admin-req-${item.id}`} onPress={() => router.push(`/chat/${item.id}`)}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <AppText weight="bold" size="lg">{item.service_name}</AppText>
                  <AppText size="sm" color={colors.muted} style={{ marginTop: 2 }}>{item.customer_name}</AppText>
                </View>
                <StatusBadge status={item.status} />
              </View>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
                <AppText size="sm" color={colors.muted}>{item.assigned_provider_name || "—"}</AppText>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: spacing.md }}>
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 4, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill }}>
                    <Ionicons name="chatbubble-outline" size={14} color={colors.onBrandTertiary} />
                    <AppText size="sm" weight="bold" color={colors.onBrandTertiary}>{t("chat")}</AppText>
                  </View>
                  <Pressable testID={`del-req-${item.id}`} onPress={() => { haptic("medium"); del.mutate(item.id); }} hitSlop={8} style={{ padding: 4 }}>
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  </Pressable>
                </View>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}
