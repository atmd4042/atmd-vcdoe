import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, AppButton, AppInput, spacing, radius, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";

export default function Login() {
  const { colors } = useTheme();
  const { t, isRTL, toggle, lang } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    if (!identifier || !password) {
      Toast.show({ type: "error", text1: t("error"), text2: "أكمل جميع الحقول" });
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { identifier, password });
      const mode = res.needs_registration_verify ? "registration" : "login";
      router.push({ pathname: "/(auth)/verify", params: { challenge_id: res.challenge_id, email: res.email, mode } });
    } catch (e: any) {
      haptic("error");
      Toast.show({ type: "error", text1: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <LinearGradient colors={[colors.brandPrimary, colors.brand]} style={{ paddingTop: insets.top + spacing.xl, paddingBottom: spacing["2xl"], paddingHorizontal: spacing.lg, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <Pressable testID="lang-toggle" onPress={() => { haptic("selection"); toggle(); }} style={{ alignSelf: isRTL ? "flex-start" : "flex-end", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFFFFF22", paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill }}>
          <Ionicons name="language" size={16} color="#FFFFFF" />
          <AppText color="#FFFFFF" size="sm" weight="bold">{lang === "ar" ? "EN" : "ع"}</AppText>
        </Pressable>
        <View style={{ alignItems: "center", marginTop: spacing.lg }}>
          <View style={{ width: 72, height: 72, borderRadius: radius.lg, backgroundColor: "#FFFFFF14", alignItems: "center", justifyContent: "center", marginBottom: spacing.md }}>
            <Ionicons name="shield-checkmark" size={40} color={colors.accent} />
          </View>
          <AppText color="#FFFFFF" weight="bold" size="2xl">{t("appName")}</AppText>
          <AppText color="#FFFFFFcc" size="base" style={{ marginTop: 4 }}>{t("tagline")}</AppText>
        </View>
      </LinearGradient>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} bottomOffset={20}>
        <AppText weight="bold" size="xl" style={{ marginTop: spacing.sm }}>{t("login")}</AppText>
        <AppInput testID="login-identifier" value={identifier} onChangeText={setIdentifier} placeholder={t("emailOrPhone")} icon="person-outline" keyboardType="email-address" />
        <AppInput testID="login-password" value={password} onChangeText={setPassword} placeholder={t("password")} icon="lock-closed-outline" secureToggle />
        <AppButton testID="login-submit" title={t("continue")} onPress={onLogin} loading={loading} style={{ marginTop: spacing.sm }} />

        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "center", gap: 6, marginTop: spacing.md }}>
          <AppText color={colors.muted} size="base">{t("forgotAccount")}</AppText>
          <Pressable testID="go-register" onPress={() => router.push("/(auth)/register")}>
            <AppText color={colors.brandPrimary} weight="bold" size="base">{t("register")}</AppText>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
