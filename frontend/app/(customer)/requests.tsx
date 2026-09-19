import React from "react";
import { View, FlatList } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText, Card, StatusBadge, AppButton, Loading, EmptyState, spacing } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";

export default function Requests() {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["my-requests"], queryFn: () => api.get("/requests/mine") });

  const typeLabel = (a: string) => t(a as any);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AppText weight="bold" size="xl">{t("myRequests")}</AppText>
      </View>
      {q.isLoading ? <Loading /> : (
        <FlatList
          data={q.data || []}
          keyExtractor={(i: any) => i.id}
          onRefresh={() => q.refetch()}
          refreshing={q.isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["3xl"] }}
          ListEmptyComponent={<EmptyState icon="documents-outline" text={t("noRequests")} />}
          renderItem={({ item }) => (
            <Card testID={`request-${item.id}`}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <AppText weight="bold" size="lg">{item.service_name}</AppText>
                  <AppText size="sm" color={colors.muted} style={{ marginTop: 2 }}>{item.category}</AppText>
                </View>
                <StatusBadge status={item.status} />
              </View>
              <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.md }} />
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between" }}>
                <AppText size="sm" color={colors.muted}>{t("applicantType")}: {typeLabel(item.applicant_type)}</AppText>
                <AppText size="base" weight="bold" color={colors.brandPrimary}>{item.price > 0 ? `${item.price} ${t("sar")}` : t("onRequest")}</AppText>
              </View>
              {item.assigned_provider_name ? (
                <AppText size="sm" color={colors.muted} style={{ marginTop: spacing.sm }}>{t("providers")}: {item.assigned_provider_name}</AppText>
              ) : null}
              {item.assigned_provider_id ? (
                <AppButton testID={`contact-provider-${item.id}`} title={t("contactProvider")} icon="chatbubbles-outline" variant="secondary" onPress={() => router.push(`/chat/${item.id}`)} style={{ marginTop: spacing.md }} />
              ) : null}
            </Card>
          )}
        />
      )}
    </View>
  );
}
