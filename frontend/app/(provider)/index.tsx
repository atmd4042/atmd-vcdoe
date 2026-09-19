import React, { useState } from "react";
import { View, ScrollView, FlatList, Pressable } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, Card, StatusBadge, AppButton, Loading, EmptyState, spacing, radius, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import NotificationBell from "@/src/components/NotificationBell";

const FILTERS = ["all", "pending", "in_progress", "completed"];

export default function ProviderHome() {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [filter, setFilter] = useState("all");

  const statsQ = useQuery({ queryKey: ["provider-stats"], queryFn: () => api.get("/provider/stats") });
  const reqQ = useQuery({ queryKey: ["provider-requests", filter], queryFn: () => api.get(`/provider/requests?status=${filter}`) });

  const mut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.post(`/provider/requests/${id}/status`, { status }),
    onSuccess: () => {
      haptic("success");
      Toast.show({ type: "success", text1: t("saved") });
      qc.invalidateQueries({ queryKey: ["provider-requests"] });
      qc.invalidateQueries({ queryKey: ["provider-stats"] });
    },
    onError: (e: any) => Toast.show({ type: "error", text1: e.message }),
  });

  const Stat = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <Card style={{ flex: 1, padding: spacing.md, alignItems: "center" }}>
      <AppText weight="bold" size="2xl" color={color}>{value}</AppText>
      <AppText size="sm" color={colors.muted}>{label}</AppText>
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.sm }}>
        <View style={{ paddingHorizontal: spacing.lg, flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <AppText size="base" color={colors.muted}>{t("welcome")}</AppText>
            <AppText weight="bold" size="xl">{user?.office_name || user?.name}</AppText>
          </View>
          <NotificationBell />
        </View>
        <View style={{ height: 56, justifyContent: "center", marginTop: spacing.sm }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center" }}>
            {FILTERS.map((f) => {
              const active = filter === f;
              return (
                <Pressable key={f} testID={`filter-${f}`} onPress={() => { haptic("selection"); setFilter(f); }} style={{ height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: active ? colors.brandPrimary : colors.surfaceTertiary, borderWidth: 1, borderColor: active ? colors.brandPrimary : colors.border }}>
                  <AppText size="base" weight="medium" color={active ? colors.onBrandPrimary : colors.onSurfaceTertiary}>{f === "all" ? t("all") : t(f as any)}</AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {reqQ.isLoading ? <Loading /> : (
        <FlatList
          data={reqQ.data || []}
          keyExtractor={(i: any) => i.id}
          onRefresh={() => { reqQ.refetch(); statsQ.refetch(); }}
          refreshing={reqQ.isRefetching}
          ListHeaderComponent={
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: spacing.md, marginBottom: spacing.md }}>
              <Stat label={t("pending")} value={statsQ.data?.pending ?? 0} color={colors.warning} />
              <Stat label={t("in_progress")} value={statsQ.data?.in_progress ?? 0} color={colors.info} />
              <Stat label={t("completed")} value={statsQ.data?.completed ?? 0} color={colors.success} />
            </View>
          }
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["3xl"] }}
          ListEmptyComponent={<EmptyState icon="briefcase-outline" text={t("noRequests")} />}
          renderItem={({ item }) => (
            <Card testID={`prov-req-${item.id}`}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <AppText weight="bold" size="lg">{item.service_name}</AppText>
                  <AppText size="sm" color={colors.muted} style={{ marginTop: 2 }}>{item.customer_name} · {item.customer_phone}</AppText>
                </View>
                <StatusBadge status={item.status} />
              </View>
              <AppText size="sm" color={colors.muted} style={{ marginTop: spacing.sm }}>{t("applicantType")}: {t(item.applicant_type as any)}</AppText>
              {item.notes ? <AppText size="sm" style={{ marginTop: 4 }}>{item.notes}</AppText> : null}
              {(item.status === "in_progress" || item.status === "completed") ? (
                <View style={{ marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, gap: 4 }}>
                  <AppText size="sm" weight="bold" color={colors.onSurfaceTertiary}>{t("customerInfo")}</AppText>
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="mail-outline" size={14} color={colors.muted} />
                    <AppText size="sm" color={colors.onSurfaceSecondary}>{item.customer_email}</AppText>
                  </View>
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="call-outline" size={14} color={colors.muted} />
                    <AppText size="sm" color={colors.onSurfaceSecondary}>{item.customer_phone}</AppText>
                  </View>
                </View>
              ) : null}
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: spacing.sm, marginTop: spacing.md }}>
                {item.status === "pending" ? (
                  <AppButton title={t("startWork")} icon="checkmark-outline" onPress={() => mut.mutate({ id: item.id, status: "in_progress" })} style={{ flex: 1 }} />
                ) : null}
                {item.status === "in_progress" ? (
                  <AppButton title={t("markComplete")} icon="checkmark-done-outline" onPress={() => mut.mutate({ id: item.id, status: "completed" })} style={{ flex: 1 }} />
                ) : null}
                {item.status !== "completed" && item.status !== "rejected" ? (
                  <AppButton title={t("reject")} variant="outline" onPress={() => mut.mutate({ id: item.id, status: "rejected" })} style={{ flex: 1 }} />
                ) : null}
              </View>
              {(item.status === "in_progress" || item.status === "completed") ? (
                <AppButton testID={`contact-${item.id}`} title={t("contactCustomer")} icon="chatbubbles-outline" variant="secondary" onPress={() => router.push(`/chat/${item.id}`)} style={{ marginTop: spacing.sm }} />
              ) : null}
            </Card>
          )}
        />
      )}
    </View>
  );
}
