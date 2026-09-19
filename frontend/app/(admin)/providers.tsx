import React from "react";
import { View, FlatList } from "react-native";
import { Image } from "expo-image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, Card, StatusBadge, AppButton, Loading, EmptyState, spacing, radius, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";

export default function AdminProviders() {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-providers"], queryFn: () => api.get("/admin/providers") });

  const mut = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) => api.post(`/admin/providers/${id}/approval`, { approved }),
    onSuccess: () => { haptic("success"); Toast.show({ type: "success", text1: t("saved") }); qc.invalidateQueries({ queryKey: ["admin-providers"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); },
    onError: (e: any) => Toast.show({ type: "error", text1: e.message }),
  });

  const suspendMut = useMutation({
    mutationFn: ({ id, suspended }: { id: string; suspended: boolean }) => api.post(`/admin/providers/${id}/suspend`, { suspended }),
    onSuccess: () => { haptic("success"); Toast.show({ type: "success", text1: t("saved") }); qc.invalidateQueries({ queryKey: ["admin-providers"] }); },
    onError: (e: any) => Toast.show({ type: "error", text1: e.message }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.del(`/admin/users/${id}`),
    onSuccess: () => { haptic("success"); Toast.show({ type: "success", text1: t("saved") }); qc.invalidateQueries({ queryKey: ["admin-providers"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); },
    onError: (e: any) => Toast.show({ type: "error", text1: e.message }),
  });

  const statusOf = (p: any) => p.approved ? "approved" : p.provider_status === "rejected" ? "rejected" : "pending";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AppText weight="bold" size="xl">{t("providers")}</AppText>
      </View>
      {q.isLoading ? <Loading /> : (
        <FlatList
          data={q.data || []}
          keyExtractor={(i: any) => i.id}
          onRefresh={() => q.refetch()}
          refreshing={q.isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["3xl"] }}
          ListEmptyComponent={<EmptyState icon="business-outline" text={t("noRequests")} />}
          renderItem={({ item }) => (
            <Card testID={`provider-${item.id}`}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <AppText weight="bold" size="lg">{item.office_name || item.name}</AppText>
                  <AppText size="sm" color={colors.muted}>{item.email} · {item.phone}</AppText>
                </View>
                <StatusBadge status={statusOf(item)} />
                <Pressable testID={`del-provider-${item.id}`} onPress={() => { haptic("medium"); delMut.mutate(item.id); }} hitSlop={8} style={{ padding: 4, marginTop: 2 }}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </Pressable>
              </View>
              {(item.documents?.length || item.activity_image) ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>
                  {[...(item.documents || []), item.activity_image].filter(Boolean).map((d: string) => (
                    <Image key={d} source={{ uri: api.fileUrl(d) }} style={{ width: 68, height: 68, borderRadius: radius.sm }} contentFit="cover" />
                  ))}
                </View>
              ) : null}
              {!item.approved && item.provider_status !== "rejected" ? (
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: spacing.sm, marginTop: spacing.md }}>
                  <AppButton testID={`approve-${item.id}`} title={t("approve")} icon="checkmark" onPress={() => mut.mutate({ id: item.id, approved: true })} style={{ flex: 1 }} />
                  <AppButton testID={`reject-${item.id}`} title={t("reject")} variant="outline" onPress={() => mut.mutate({ id: item.id, approved: false })} style={{ flex: 1 }} />
                </View>
              ) : item.provider_status === "rejected" ? (
                <AppButton testID={`reapprove-${item.id}`} title={t("approve")} onPress={() => mut.mutate({ id: item.id, approved: true })} style={{ marginTop: spacing.md }} />
              ) : (
                <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                  {item.suspended ? (
                    <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="lock-closed" size={16} color={colors.error} />
                      <AppText size="sm" weight="bold" color={colors.error}>{t("suspended")}</AppText>
                    </View>
                  ) : null}
                  <AppButton
                    testID={`suspend-${item.id}`}
                    title={item.suspended ? t("activate") : t("suspend")}
                    icon={item.suspended ? "checkmark-circle-outline" : "pause-circle-outline"}
                    variant={item.suspended ? "primary" : "outline"}
                    onPress={() => suspendMut.mutate({ id: item.id, suspended: !item.suspended })}
                  />
                </View>
              )}
            </Card>
          )}
        />
      )}
    </View>
  );
}
