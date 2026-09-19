import React from "react";
import { View, ScrollView, Pressable, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, Card, spacing, radius, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/auth";

type Row = { icon: string; label: string; onPress: () => void; danger?: boolean; right?: React.ReactNode };

export default function MoreScreen() {
  const { colors } = useTheme();
  const { t, isRTL, lang, toggle } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

  const rows: Row[] = [
    { icon: "person-outline", label: t("editProfile"), onPress: () => router.push("/edit-profile") },
    { icon: "information-circle-outline", label: t("aboutApp"), onPress: () => router.push("/about") },
    { icon: "call-outline", label: t("contactUs"), onPress: () => router.push("/contact") },
    { icon: "logo-whatsapp", label: t("whatsapp"), onPress: () => Linking.openURL("https://wa.me/966559384584") },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AppText weight="bold" size="xl">{t("more")}</AppText>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["3xl"] }}>
        {/* profile card */}
        <Card>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: spacing.md }}>
            <View style={{ width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" }}>
              <AppText color={colors.onBrandPrimary} weight="bold" size="xl">{(user?.name || "?").charAt(0)}</AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText weight="bold" size="lg">{user?.name}</AppText>
              <AppText size="sm" color={colors.muted}>{user?.email}</AppText>
            </View>
          </View>
        </Card>

        <Card style={{ padding: 0, overflow: "hidden" }}>
          {rows.map((r, i) => (
            <Pressable key={r.label} testID={`more-${r.icon}`} onPress={() => { haptic("light"); r.onPress(); }} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.divider }}>
              <Ionicons name={r.icon as any} size={22} color={colors.brandPrimary} />
              <AppText size="base" style={{ flex: 1 }}>{r.label}</AppText>
              <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={18} color={colors.muted} />
            </Pressable>
          ))}
          {/* language */}
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
            <Ionicons name="language-outline" size={22} color={colors.brandPrimary} />
            <AppText size="base" style={{ flex: 1 }}>{t("language")}</AppText>
            <Pressable testID="lang-switch" onPress={() => { haptic("selection"); toggle(); }} style={{ flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, padding: 3 }}>
              <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: lang === "ar" ? colors.brandPrimary : "transparent" }}>
                <AppText size="sm" weight="bold" color={lang === "ar" ? colors.onBrandPrimary : colors.muted}>ع</AppText>
              </View>
              <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: lang === "en" ? colors.brandPrimary : "transparent" }}>
                <AppText size="sm" weight="bold" color={lang === "en" ? colors.onBrandPrimary : colors.muted}>EN</AppText>
              </View>
            </Pressable>
          </View>
        </Card>

        <Pressable testID="logout-button" onPress={async () => { haptic("medium"); await signOut(); router.replace("/(auth)/login"); }} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.error + "15" }}>
          <Ionicons name="log-out-outline" size={22} color={colors.error} />
          <AppText size="base" weight="bold" color={colors.error}>{t("logout")}</AppText>
        </Pressable>
      </ScrollView>
    </View>
  );
}
