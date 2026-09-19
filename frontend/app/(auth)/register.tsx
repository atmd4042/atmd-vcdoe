import React, { useState } from "react";
import { View, Pressable, Image } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Toast from "react-native-toast-message";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, AppButton, AppInput, Header, spacing, radius, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { pickImageAndUpload } from "@/src/imagePicker";

type Role = "customer" | "service_provider";

export default function Register() {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const [role, setRole] = useState<Role>("customer");
  const [form, setForm] = useState({ name: "", officeName: "", email: "", phone: "", password: "", confirm: "" });
  const [docs, setDocs] = useState<string[]>([]);
  const [activityImage, setActivityImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const addImage = async (source: "camera" | "gallery", kind: "doc" | "activity") => {
    const path = await pickImageAndUpload(source, true);
    if (!path) return;
    haptic("success");
    if (kind === "doc") setDocs((d) => [...d, path]);
    else setActivityImage(path);
  };

  const onSubmit = async () => {
    if (form.password !== form.confirm) {
      Toast.show({ type: "error", text1: t("passwordsNoMatch") });
      return;
    }
    if (!form.email || !form.phone || !form.password) {
      Toast.show({ type: "error", text1: "أكمل جميع الحقول المطلوبة" });
      return;
    }
    setLoading(true);
    try {
      let res;
      if (role === "customer") {
        if (!form.name) { Toast.show({ type: "error", text1: "الاسم مطلوب" }); setLoading(false); return; }
        res = await api.post("/auth/register", { name: form.name, email: form.email, phone: form.phone, password: form.password });
      } else {
        if (!form.officeName) { Toast.show({ type: "error", text1: "اسم المكتب مطلوب" }); setLoading(false); return; }
        res = await api.post("/auth/register-provider", { office_name: form.officeName, email: form.email, phone: form.phone, password: form.password, documents: docs, activity_image: activityImage });
      }
      router.push({ pathname: "/(auth)/verify", params: { challenge_id: res.challenge_id, email: res.email, mode: "registration" } });
    } catch (e: any) {
      haptic("error");
      Toast.show({ type: "error", text1: e.message });
    } finally {
      setLoading(false);
    }
  };

  const RoleTab = ({ value, label, icon }: { value: Role; label: string; icon: string }) => {
    const active = role === value;
    return (
      <Pressable testID={`role-${value}`} onPress={() => { haptic("selection"); setRole(value); }} style={{ flex: 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: active ? colors.brandPrimary : colors.surfaceTertiary }}>
        <Ionicons name={icon as any} size={18} color={active ? colors.onBrandPrimary : colors.muted} />
        <AppText size="base" weight="bold" color={active ? colors.onBrandPrimary : colors.muted}>{label}</AppText>
      </Pressable>
    );
  };

  const ImageThumbs = () => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {docs.map((d) => (
        <Image key={d} source={{ uri: api.fileUrl(d) }} style={{ width: 64, height: 64, borderRadius: radius.sm }} />
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Header title={t("register")} back />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["3xl"] }} bottomOffset={20}>
        <AppText size="base" color={colors.muted}>{t("accountType")}</AppText>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <RoleTab value="customer" label={t("asCustomer")} icon="person" />
          <RoleTab value="service_provider" label={t("asProvider")} icon="business" />
        </View>

        {role === "customer" ? (
          <AppInput testID="reg-name" value={form.name} onChangeText={(v) => set("name", v)} placeholder={t("name")} icon="person-outline" autoCapitalize="words" />
        ) : (
          <AppInput testID="reg-office" value={form.officeName} onChangeText={(v) => set("officeName", v)} placeholder={t("officeName")} icon="business-outline" autoCapitalize="words" />
        )}
        <AppInput testID="reg-email" value={form.email} onChangeText={(v) => set("email", v)} placeholder={t("email")} icon="mail-outline" keyboardType="email-address" />
        <AppInput testID="reg-phone" value={form.phone} onChangeText={(v) => set("phone", v)} placeholder={t("phone")} icon="call-outline" keyboardType="phone-pad" />
        <AppInput testID="reg-password" value={form.password} onChangeText={(v) => set("password", v)} placeholder={t("password")} icon="lock-closed-outline" secureToggle />
        <AppText size="sm" color={colors.muted}>{t("passwordHint")}</AppText>
        <AppInput testID="reg-confirm" value={form.confirm} onChangeText={(v) => set("confirm", v)} placeholder={t("confirmPassword")} icon="lock-closed-outline" secureToggle />

        {role === "service_provider" ? (
          <View style={{ gap: spacing.sm }}>
            <AppText size="base" weight="bold" style={{ marginTop: spacing.sm }}>{t("uploadDocs")}</AppText>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <AppButton title={t("fromCamera")} icon="camera-outline" variant="outline" onPress={() => addImage("camera", "doc")} style={{ flex: 1 }} />
              <AppButton title={t("fromGallery")} icon="images-outline" variant="outline" onPress={() => addImage("gallery", "doc")} style={{ flex: 1 }} />
            </View>
            <ImageThumbs />
            <AppText size="base" weight="bold" style={{ marginTop: spacing.sm }}>{t("activityImage")}</AppText>
            <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
              <AppButton title={t("fromGallery")} icon="image-outline" variant="outline" onPress={() => addImage("gallery", "activity")} style={{ flex: 1 }} />
              {activityImage ? <Image source={{ uri: api.fileUrl(activityImage) }} style={{ width: 52, height: 52, borderRadius: radius.sm }} /> : null}
            </View>
          </View>
        ) : null}

        <AppButton testID="reg-submit" title={t("continue")} onPress={onSubmit} loading={loading} style={{ marginTop: spacing.md }} />
      </KeyboardAwareScrollView>
    </View>
  );
}
