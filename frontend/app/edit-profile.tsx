import React, { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useMutation } from "@tanstack/react-query";
import Toast from "react-native-toast-message";

import { AppText, AppButton, AppInput, Header, spacing, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

export default function EditProfile() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [bio, setBio] = useState(user?.bio || "");

  const mut = useMutation({
    mutationFn: () => api.put("/profile", { name, phone, bio }),
    onSuccess: (u) => { haptic("success"); setUser(u); Toast.show({ type: "success", text1: t("saved") }); },
    onError: (e: any) => Toast.show({ type: "error", text1: e.message }),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Header title={t("editProfile")} back />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} bottomOffset={20}>
        <AppText size="sm" color={colors.muted}>{t("name")}</AppText>
        <AppInput testID="profile-name" value={name} onChangeText={setName} placeholder={t("name")} icon="person-outline" autoCapitalize="words" />
        <AppText size="sm" color={colors.muted}>{t("phone")}</AppText>
        <AppInput testID="profile-phone" value={phone} onChangeText={setPhone} placeholder={t("phone")} icon="call-outline" keyboardType="phone-pad" />
        <AppText size="sm" color={colors.muted}>{t("bio")} ({t("optional")})</AppText>
        <AppInput testID="profile-bio" value={bio} onChangeText={setBio} placeholder={t("bio")} icon="document-text-outline" multiline />
        <AppButton testID="profile-save" title={t("saveChanges")} onPress={() => mut.mutate()} loading={mut.isPending} style={{ marginTop: spacing.md }} />
      </KeyboardAwareScrollView>
    </View>
  );
}
