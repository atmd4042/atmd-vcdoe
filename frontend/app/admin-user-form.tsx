import React, { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";

import { AppText, AppButton, AppInput, Header, spacing, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";

export default function AdminUserForm() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id: string; name: string; phone: string; bio: string }>();
  const [name, setName] = useState(params.name || "");
  const [phone, setPhone] = useState(params.phone || "");
  const [bio, setBio] = useState(params.bio || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/users/${params.id}`, { name, phone, bio });
      haptic("success"); Toast.show({ type: "success", text1: t("saved") });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      router.back();
    } catch (e: any) { Toast.show({ type: "error", text1: e.message }); }
    finally { setSaving(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Header title={t("edit")} back />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} bottomOffset={20}>
        <AppText size="sm" color={colors.muted}>{t("name")}</AppText>
        <AppInput testID="user-name" value={name} onChangeText={setName} placeholder={t("name")} icon="person-outline" autoCapitalize="words" />
        <AppText size="sm" color={colors.muted}>{t("phone")}</AppText>
        <AppInput testID="user-phone" value={phone} onChangeText={setPhone} placeholder={t("phone")} icon="call-outline" keyboardType="phone-pad" />
        <AppText size="sm" color={colors.muted}>{t("bio")}</AppText>
        <AppInput testID="user-bio" value={bio} onChangeText={setBio} placeholder={t("bio")} multiline />
        <AppButton testID="user-save" title={t("saveChanges")} onPress={save} loading={saving} style={{ marginTop: spacing.md }} />
      </KeyboardAwareScrollView>
    </View>
  );
}
