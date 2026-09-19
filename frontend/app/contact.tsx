import React from "react";
import { View, ScrollView, Pressable, Linking } from "react-native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, Header, Card, spacing, radius, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";

export default function Contact() {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api.get("/settings") });
  const s = q.data || {};

  const wa = (s.contact_whatsapp || "0559384584").replace(/^0/, "966").replace(/[^0-9]/g, "");

  const Row = ({ icon, label, value, onPress, color }: any) => (
    <Pressable testID={`contact-${icon}`} onPress={() => { haptic("light"); onPress(); }} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: spacing.md }}>
      <View style={{ width: 46, height: 46, borderRadius: radius.md, backgroundColor: (color || colors.brandPrimary) + "18", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={22} color={color || colors.brandPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText size="sm" color={colors.muted}>{label}</AppText>
        <AppText size="base" weight="medium">{value}</AppText>
      </View>
      <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={18} color={colors.muted} />
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Header title={t("contactUs")} back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Card style={{ gap: spacing.lg }}>
          <Row icon="call" label={t("phone")} value={s.contact_phone || "0559384584"} onPress={() => Linking.openURL(`tel:${s.contact_phone || "0559384584"}`)} />
          <View style={{ height: 1, backgroundColor: colors.divider }} />
          <Row icon="mail" label={t("email")} value={s.contact_email || "atmd4042@gmail.com"} onPress={() => Linking.openURL(`mailto:${s.contact_email || "atmd4042@gmail.com"}`)} />
          <View style={{ height: 1, backgroundColor: colors.divider }} />
          <Row icon="logo-whatsapp" label={t("whatsapp")} value={s.contact_whatsapp || "0559384584"} color="#25D366" onPress={() => Linking.openURL(`https://wa.me/${wa}`)} />
        </Card>
      </ScrollView>
    </View>
  );
}
