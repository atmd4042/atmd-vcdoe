import React, { useState, useEffect } from "react";
import { View, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Toast from "react-native-toast-message";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, AppButton, AppInput, Header, spacing, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

export default function Verify() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { signIn } = useAuth();
  const params = useLocalSearchParams<{ challenge_id: string; email: string; mode: string }>();
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState(params.challenge_id);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get(`/auth/otp-by-challenge/${challengeId}`);
        if (r?.otp) setOtp(String(r.otp));
      } catch {}
    })();
  }, [challengeId]);

  const onVerify = async () => {
    if (otp.length < 4) { Toast.show({ type: "error", text1: "أدخل الرمز" }); return; }
    setLoading(true);
    try {
      if (params.mode === "registration") {
        const res = await api.post("/auth/verify-registration", { challenge_id: challengeId, otp });
        if (res.pending_approval) {
          haptic("success");
          Toast.show({ type: "success", text1: res.message });
          router.replace("/(auth)/login");
          return;
        }
        haptic("success");
        await signIn(res.access_token, res.user);
        router.replace("/");
      } else {
        const res = await api.post("/auth/verify-login", { challenge_id: challengeId, otp });
        haptic("success");
        await signIn(res.access_token, res.user);
        router.replace("/");
      }
    } catch (e: any) {
      haptic("error");
      Toast.show({ type: "error", text1: e.message });
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    try {
      const purpose = params.mode === "registration" ? "registration" : "login";
      const res = await api.post("/auth/resend-otp", { email: params.email, purpose });
      setChallengeId(res.challenge_id);
      Toast.show({ type: "success", text1: t("resend") + " ✓" });
    } catch (e: any) {
      Toast.show({ type: "error", text1: e.message });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Header title={t("verifyCode")} back />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} bottomOffset={20}>
        <View style={{ alignItems: "center", marginVertical: spacing.lg }}>
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="mail-open-outline" size={38} color={colors.brandPrimary} />
          </View>
          <AppText weight="bold" size="xl" style={{ marginTop: spacing.md }}>{t("verifyTitle")}</AppText>
          <AppText color={colors.muted} size="base" style={{ textAlign: "center", marginTop: 4 }}>{t("verifySub")}</AppText>
          <AppText color={colors.brandPrimary} weight="bold" size="base">{params.email}</AppText>
        </View>

        <AppInput testID="otp-input" value={otp} onChangeText={setOtp} placeholder="______" icon="key-outline" keyboardType="number-pad" />
        <AppButton testID="verify-submit" title={t("verify")} onPress={onVerify} loading={loading} />
        <Pressable testID="resend-otp" onPress={onResend} style={{ alignSelf: "center", marginTop: spacing.sm }}>
          <AppText color={colors.brandPrimary} weight="bold" size="base">{t("resend")}</AppText>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}
