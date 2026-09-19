import React from "react";
import { View, ScrollView, Pressable, RefreshControl } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, Card, StatusBadge, IconCircle, EmptyState, spacing, radius, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import NotificationBell from "@/src/components/NotificationBell";

export default function CustomerHome() {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const catsQ = useQuery({ queryKey: ["categories"], queryFn: () => api.get("/categories") });
  const reqQ = useQuery({ queryKey: ["my-requests"], queryFn: () => api.get("/requests/mine") });
  const notesQ = useQuery({ queryKey: ["notes"], queryFn: () => api.get("/notes") });
  const discountQ = useQuery({ queryKey: ["my-discount"], queryFn: () => api.get("/my-discount") });

  const refreshing = catsQ.isRefetching || reqQ.isRefetching;
  const onRefresh = () => { catsQ.refetch(); reqQ.refetch(); notesQ.refetch(); discountQ.refetch(); };

  const discount = discountQ.data?.discount;
  const notes = notesQ.data || [];

  const pending = (reqQ.data || []).filter((r: any) => r.status !== "completed" && r.status !== "rejected");

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {/* header */}
      <View style={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md, paddingHorizontal: spacing.lg, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <AppText size="base" color={colors.muted}>{t("welcome")} 👋</AppText>
          <AppText size="xl" weight="bold">{user?.name}</AppText>
        </View>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: spacing.sm }}>
          <NotificationBell />
          <Pressable testID="services-shortcut" onPress={() => router.push("/(customer)/services")} style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="grid-outline" size={22} color={colors.accent} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing["3xl"] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}>
        {/* services hero */}
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Pressable testID="services-hero" onPress={() => router.push("/(customer)/services")}>
            <LinearGradient colors={[colors.brandPrimary, colors.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.lg, padding: spacing.xl }}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <AppText color="#FFFFFF" weight="bold" size="xl">{t("appName")}</AppText>
                  <AppText color="#FFFFFFcc" size="base" style={{ marginTop: 6 }}>{t("tagline")}</AppText>
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, marginTop: spacing.md, backgroundColor: colors.accent, alignSelf: "flex-start", paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill }}>
                    <Ionicons name="grid-outline" size={16} color={colors.onAccent} />
                    <AppText color={colors.onAccent} size="sm" weight="bold">{t("allServices")}</AppText>
                  </View>
                </View>
                <Ionicons name="shield-checkmark" size={56} color={colors.accent} />
              </View>
            </LinearGradient>
          </Pressable>
        </View>

        {/* discount banner */}
        {discount ? (
          <View testID="discount-banner" style={{ marginHorizontal: spacing.lg, marginTop: spacing.md, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.accent, borderRadius: radius.lg, padding: spacing.md }}>
            <Ionicons name="pricetag" size={24} color={colors.onAccent} />
            <View style={{ flex: 1 }}>
              <AppText weight="bold" size="base" color={colors.onAccent}>{discount.title}</AppText>
              <AppText size="sm" color={colors.onAccent}>{t("yourDiscount")}: {Math.round(discount.percent)}% {t("off")}</AppText>
            </View>
          </View>
        ) : null}

        {/* notes banner */}
        {notes.length ? (
          <View style={{ marginHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm }}>
            {notes.slice(0, 3).map((n: any) => (
              <View key={n.id} testID={`note-banner-${n.id}`} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "flex-start", gap: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name="megaphone-outline" size={20} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <AppText weight="bold" size="base">{n.title}</AppText>
                  <AppText size="sm" color={colors.onSurfaceSecondary}>{n.body}</AppText>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* quick access */}
        <View style={{ marginTop: spacing.xl }}>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
            <AppText weight="bold" size="lg">{t("quickAccess")}</AppText>
            <Pressable onPress={() => router.push("/(customer)/services")}>
              <AppText color={colors.brandPrimary} size="base" weight="bold">{t("allServices")}</AppText>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md, flexDirection: isRTL ? "row-reverse" : "row" }}>
            {(catsQ.data || []).map((cat: any) => (
              <Pressable key={cat.id} testID={`cat-${cat.id}`} onPress={() => { haptic("light"); router.push({ pathname: "/(customer)/services", params: { category: cat.name } }); }} style={{ alignItems: "center", width: 84, gap: 6 }}>
                <IconCircle name={cat.icon} size={60} />
                <AppText size="sm" numberOfLines={1} style={{ textAlign: "center" }}>{cat.name}</AppText>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* pending requests */}
        <View style={{ marginTop: spacing.xl, paddingHorizontal: spacing.lg, gap: spacing.md }}>
          <AppText weight="bold" size="lg">{t("myRequests")}</AppText>
          {pending.length === 0 ? (
            <EmptyState icon="documents-outline" text={t("noRequests")} />
          ) : (
            pending.slice(0, 5).map((r: any) => (
              <Card key={r.id} testID={`req-${r.id}`}>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold" size="base">{r.service_name}</AppText>
                    <AppText size="sm" color={colors.muted} style={{ marginTop: 2 }}>{r.category}{r.price > 0 ? ` · ${r.price} ${t("sar")}` : ""}</AppText>
                  </View>
                  <StatusBadge status={r.status} />
                </View>
              </Card>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
