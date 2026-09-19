import React from "react";
import { View, ScrollView, Pressable } from "react-native";
import { AppText, spacing, radius, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";

const AUD = ["all", "customers", "providers", "user"];

export function AudiencePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const label = (a: string) => a === "all" ? t("audienceAll") : a === "customers" ? t("audienceCustomers") : a === "providers" ? t("audienceProviders") : t("audienceUser");
  return (
    <View>
      <AppText size="sm" color={colors.muted} style={{ marginBottom: spacing.sm }}>{t("audience")}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, flexDirection: isRTL ? "row-reverse" : "row" }}>
        {AUD.map((a) => {
          const active = value === a;
          return (
            <Pressable key={a} testID={`aud-${a}`} onPress={() => { haptic("selection"); onChange(a); }} style={{ height: 40, paddingHorizontal: spacing.lg, borderRadius: radius.pill, justifyContent: "center", flexShrink: 0, backgroundColor: active ? colors.brandPrimary : colors.surfaceTertiary, borderWidth: 1, borderColor: active ? colors.brandPrimary : colors.border }}>
              <AppText size="base" weight="medium" color={active ? colors.onBrandPrimary : colors.onSurfaceTertiary}>{label(a)}</AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
