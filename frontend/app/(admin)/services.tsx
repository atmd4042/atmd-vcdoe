import React from "react";
import { View, FlatList, Pressable } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, Card, Loading, EmptyState, spacing, radius, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";

export default function AdminServices() {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["services", "all"], queryFn: () => api.get("/services?category=all") });

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/admin/services/${id}`),
    onSuccess: () => { haptic("success"); Toast.show({ type: "success", text1: t("saved") }); qc.invalidateQueries({ queryKey: ["services"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); },
    onError: (e: any) => Toast.show({ type: "error", text1: e.message }),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" }}>
        <AppText weight="bold" size="xl">{t("services")}</AppText>
        <Pressable testID="add-service-btn" onPress={() => router.push("/admin-service-form")} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill }}>
          <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
          <AppText size="sm" weight="bold" color={colors.onBrandPrimary}>{t("addService")}</AppText>
        </Pressable>
      </View>
      {q.isLoading ? <Loading /> : (
        <FlatList
          data={q.data || []}
          keyExtractor={(i: any) => i.id}
          onRefresh={() => q.refetch()}
          refreshing={q.isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["3xl"] }}
          ListEmptyComponent={<EmptyState icon="cube-outline" text={t("noRequests")} />}
          renderItem={({ item }) => (
            <Card testID={`admin-service-${item.id}`} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: spacing.md }}>
                <View style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {item.image ? <Image source={{ uri: api.fileUrl(item.image) }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : <Ionicons name="document-text-outline" size={26} color={colors.brandPrimary} />}
                </View>
                <View style={{ flex: 1 }}>
                  <AppText weight="bold" size="base" numberOfLines={1}>{item.name}</AppText>
                  <AppText size="sm" color={colors.muted}>{item.category}{item.price > 0 ? ` · ${item.price} ${t("sar")}` : ` · ${t("onRequest")}`}</AppText>
                </View>
                <Pressable testID={`edit-${item.id}`} onPress={() => { haptic("light"); router.push({ pathname: "/admin-service-form", params: { id: item.id } }); }} hitSlop={8} style={{ padding: 6 }}>
                  <Ionicons name="create-outline" size={22} color={colors.info} />
                </Pressable>
                <Pressable testID={`delete-${item.id}`} onPress={() => { haptic("medium"); del.mutate(item.id); }} hitSlop={8} style={{ padding: 6 }}>
                  <Ionicons name="trash-outline" size={22} color={colors.error} />
                </Pressable>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}
