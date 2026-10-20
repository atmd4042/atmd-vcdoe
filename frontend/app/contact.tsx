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
  const youtube = s.contact_youtube || "https://www.youtube.com/results?search_query=%D8%A7%D8%B9%D8%AA%D9%85%D8%AF%20%D9%84%D8%AC%D9%85%D9%8A%D8%B9%20%D8%A7%D9%84%D8%AE%D8%AF%D9%85%D8%A7%D8%AA%20%D8%A7%D9%84%D8%A5%D9%84%D9%83%D8%AA%D8%B1%D9%88%D9%86%D9%8A%D8%A9";
  const tiktok = s.contact_tiktok || "https://www.tiktok.com/@atmd4042";

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

        <AppText weight="bold" size="lg" style={{ marginTop: spacing.sm }}>{t("followUs")}</AppText>
        <Card style={{ gap: spacing.lg }}>
          <Row icon="logo-youtube" label={t("youtube")} value="اعتمد لجميع الخدمات الإلكترونية" color="#FF0000" onPress={() => Linking.openURL(youtube)} />
          <View style={{ height: 1, backgroundColor: colors.divider }} />
          <Row icon="logo-tiktok" label={t("tiktok")} value="atmd4042" color={colors.onSurface} onPress={() => Linking.openURL(tiktok)} />
        </Card>
      </ScrollView>
    </View>
  );
}
