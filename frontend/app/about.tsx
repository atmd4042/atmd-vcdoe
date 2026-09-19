import React from "react";
import { View, ScrollView } from "react-native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, Header, Card, spacing, radius } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";

export default function About() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api.get("/settings") });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Header title={t("aboutApp")} back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ alignItems: "center", marginVertical: spacing.lg }}>
          <View style={{ width: 88, height: 88, borderRadius: radius.lg, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="shield-checkmark" size={48} color={colors.accent} />
          </View>
          <AppText weight="bold" size="2xl" style={{ marginTop: spacing.md }}>{t("appName")}</AppText>
          <AppText size="base" color={colors.muted}>{t("tagline")}</AppText>
        </View>
        <Card>
          <AppText weight="bold" size="lg" style={{ marginBottom: spacing.sm }}>{t("aboutTitle")}</AppText>
          <AppText size="base" color={colors.onSurfaceSecondary}>{q.data?.about}</AppText>
        </Card>
      </ScrollView>
    </View>
  );
}
