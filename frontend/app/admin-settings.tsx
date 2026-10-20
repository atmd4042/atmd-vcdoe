import React, { useState, useEffect } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";

import { AppText, AppButton, AppInput, Header, Loading, spacing, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";

export default function AdminSettings() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api.get("/settings") });
  const [about, setAbout] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [youtube, setYoutube] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (q.data) {
      setAbout(q.data.about || ""); setPhone(q.data.contact_phone || "");
      setEmail(q.data.contact_email || ""); setWhatsapp(q.data.contact_whatsapp || "");
      setYoutube(q.data.contact_youtube || ""); setTiktok(q.data.contact_tiktok || "");
    }
  }, [q.data]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/admin/settings", { about, contact_phone: phone, contact_email: email, contact_whatsapp: whatsapp, contact_youtube: youtube, contact_tiktok: tiktok });
      haptic("success"); Toast.show({ type: "success", text1: t("saved") });
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e: any) { Toast.show({ type: "error", text1: e.message }); }
    finally { setSaving(false); }
  };

  if (q.isLoading) return <View style={{ flex: 1, backgroundColor: colors.surface }}><Header title={t("editSettings")} back /><Loading /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Header title={t("editSettings")} back />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} bottomOffset={20}>
        <AppText size="sm" color={colors.muted}>{t("aboutTitle")}</AppText>
        <AppInput testID="settings-about" value={about} onChangeText={setAbout} placeholder={t("aboutTitle")} multiline />
        <AppText size="sm" color={colors.muted}>{t("phone")}</AppText>
        <AppInput testID="settings-phone" value={phone} onChangeText={setPhone} placeholder={t("phone")} icon="call-outline" keyboardType="phone-pad" />
        <AppText size="sm" color={colors.muted}>{t("email")}</AppText>
        <AppInput testID="settings-email" value={email} onChangeText={setEmail} placeholder={t("email")} icon="mail-outline" keyboardType="email-address" />
        <AppText size="sm" color={colors.muted}>{t("whatsapp")}</AppText>
        <AppInput testID="settings-whatsapp" value={whatsapp} onChangeText={setWhatsapp} placeholder={t("whatsapp")} icon="logo-whatsapp" keyboardType="phone-pad" />
        <AppText size="sm" color={colors.muted}>{t("youtube")}</AppText>
        <AppInput testID="settings-youtube" value={youtube} onChangeText={setYoutube} placeholder="https://youtube.com/@..." icon="logo-youtube" />
        <AppText size="sm" color={colors.muted}>{t("tiktok")}</AppText>
        <AppInput testID="settings-tiktok" value={tiktok} onChangeText={setTiktok} placeholder="https://tiktok.com/@atmd4042" icon="logo-tiktok" />
        <AppButton testID="settings-save" title={t("saveChanges")} onPress={save} loading={saving} style={{ marginTop: spacing.md }} />
      </KeyboardAwareScrollView>
    </View>
  );
}
