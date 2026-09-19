import React, { useState } from "react";
import { View, ScrollView, FlatList, Pressable } from "react-native";
import { Image } from "expo-image";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, Card, Loading, ErrorState, EmptyState, spacing, radius, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";

export default function Services() {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string }>();
  const [selected, setSelected] = useState<string>(params.category || "all");

  const catsQ = useQuery({ queryKey: ["categories"], queryFn: () => api.get("/categories") });
  const svcQ = useQuery({ queryKey: ["services", selected], queryFn: () => api.get(`/services?category=${encodeURIComponent(selected)}`) });

  const chips = [{ id: "all", name: t("all") }, { id: "featured", name: t("mostRequested") }, ...(catsQ.data || [])];

  const Chip = ({ id, name }: { id: string; name: string }) => {
    const val = id === "all" ? "all" : id === "featured" ? "featured" : name;
    const active = selected === val;
    return (
      <Pressable testID={`chip-${id}`} onPress={() => { haptic("selection"); setSelected(val); }} style={{ height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: active ? colors.brandPrimary : colors.surfaceTertiary, borderWidth: 1, borderColor: active ? colors.brandPrimary : colors.border }}>
        <AppText size="base" weight="medium" color={active ? colors.onBrandPrimary : colors.onSurfaceTertiary}>{name}</AppText>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AppText weight="bold" size="xl" style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>{t("services")}</AppText>
        <View style={{ height: 56, justifyContent: "center" }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center" }}>
            {chips.map((c: any) => <Chip key={c.id} id={c.id} name={c.name} />)}
          </ScrollView>
        </View>
      </View>

      {svcQ.isLoading ? <Loading /> : svcQ.isError ? <ErrorState onRetry={() => svcQ.refetch()} /> : (
        <FlatList
          data={svcQ.data || []}
          keyExtractor={(i: any) => i.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.md }}
          ListEmptyComponent={<EmptyState icon="cube-outline" text={t("noRequests")} />}
          renderItem={({ item }) => (
            <Card testID={`service-${item.id}`} onPress={() => router.push(`/service/${item.id}`)} style={{ flex: 1, padding: spacing.md }}>
              <View style={{ height: 90, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: spacing.sm }}>
                {item.image ? (
                  <Image source={{ uri: api.fileUrl(item.image) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                ) : (
                  <Ionicons name="document-text-outline" size={36} color={colors.brandPrimary} />
                )}
              </View>
              <AppText weight="bold" size="base" numberOfLines={2}>{item.name}</AppText>
              <AppText size="sm" color={colors.muted} style={{ marginTop: 2 }}>{item.category}</AppText>
              <AppText weight="bold" size="base" color={colors.brandPrimary} style={{ marginTop: spacing.sm }}>{item.price > 0 ? `${item.price} ${t("sar")}` : t("onRequest")}</AppText>
            </Card>
          )}
        />
      )}
    </View>
  );
}
