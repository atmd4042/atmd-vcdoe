import React from "react";
import { View, ScrollView, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, Card, spacing, radius, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import NotificationBell from "@/src/components/NotificationBell";

export default function AdminDashboard() {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const q = useQuery({ queryKey: ["admin-stats"], queryFn: () => api.get("/admin/stats") });

  const stats = [
    { label: t("stats_customers"), value: q.data?.customers ?? 0, icon: "people", color: colors.brandPrimary },
    { label: t("stats_providers"), value: q.data?.providers ?? 0, icon: "business", color: colors.info },
    { label: t("stats_services"), value: q.data?.services ?? 0, icon: "cube", color: colors.warning },
    { label: t("stats_requests"), value: q.data?.requests ?? 0, icon: "receipt", color: colors.success },
  ];

  const actions = [
    { label: t("addService"), icon: "add-circle-outline", onPress: () => router.push("/admin-service-form") },
    { label: t("viewChats"), icon: "chatbubbles-outline", onPress: () => router.push("/admin-requests") },
    { label: t("providers"), icon: "business-outline", onPress: () => router.push("/(admin)/providers") },
    { label: t("users"), icon: "people-outline", onPress: () => router.push("/(admin)/users") },
    { label: t("editSettings"), icon: "settings-outline", onPress: () => router.push("/admin-settings") },
    { label: t("announcements"), icon: "megaphone-outline", onPress: () => router.push("/admin-notes") },
    { label: t("discounts"), icon: "pricetag-outline", onPress: () => router.push("/admin-discounts") },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing["3xl"] }} refreshControl={undefined}>
        <LinearGradient colors={[colors.brandPrimary, colors.brand]} style={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xl, paddingHorizontal: spacing.lg, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <AppText color="#FFFFFFcc" size="base">{t("dashboard")}</AppText>
              <AppText color="#FFFFFF" weight="bold" size="2xl">{user?.name}</AppText>
            </View>
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: spacing.sm }}>
              <NotificationBell onDark />
              <Pressable testID="admin-logout" onPress={async () => { haptic("medium"); await signOut(); router.replace("/(auth)/login"); }} style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: "#FFFFFF22", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="log-out-outline" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </LinearGradient>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md, padding: spacing.lg }}>
          {stats.map((s) => (
            <Card key={s.label} style={{ width: "47%", padding: spacing.md }}>
              <Ionicons name={s.icon as any} size={26} color={s.color} />
              <AppText weight="bold" size="2xl" style={{ marginTop: spacing.sm }}>{s.value}</AppText>
              <AppText size="sm" color={colors.muted}>{s.label}</AppText>
            </Card>
          ))}
        </View>

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          <AppText weight="bold" size="lg">{t("quickAccess")}</AppText>
          {q.data?.pending_providers ? (
            <Card testID="pending-banner" onPress={() => router.push("/(admin)/providers")} style={{ backgroundColor: colors.warning + "18", borderColor: colors.warning + "44" }}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: spacing.md }}>
                <Ionicons name="alert-circle" size={24} color={colors.warning} />
                <AppText size="base" weight="bold" color={colors.warning} style={{ flex: 1 }}>{q.data.pending_providers} {t("pendingApprovals")}</AppText>
              </View>
            </Card>
          ) : null}
          {actions.map((a) => (
            <Card key={a.label} testID={`action-${a.icon}`} onPress={a.onPress} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: spacing.md }}>
                <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={a.icon as any} size={22} color={colors.brandPrimary} />
                </View>
                <AppText size="base" weight="medium" style={{ flex: 1 }}>{a.label}</AppText>
                <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={18} color={colors.muted} />
              </View>
            </Card>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
