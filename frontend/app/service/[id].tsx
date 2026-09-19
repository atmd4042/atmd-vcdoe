import React, { useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, AppButton, AppInput, Header, Loading, spacing, radius, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";

const TYPES = ["visitor", "resident", "citizen", "gulf_id"];

export default function ServiceDetail() {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [applicantType, setApplicantType] = useState("visitor");
  const [notes, setNotes] = useState("");

  const svcQ = useQuery({ queryKey: ["service", id], queryFn: () => api.get(`/services/${id}`) });
  const discountQ = useQuery({ queryKey: ["my-discount"], queryFn: () => api.get("/my-discount") });

  const mut = useMutation({
    mutationFn: () => api.post("/requests", { service_id: id, applicant_type: applicantType, notes }),
    onSuccess: () => {
      haptic("success");
      Toast.show({ type: "success", text1: t("requestSent") });
      qc.invalidateQueries({ queryKey: ["my-requests"] });
      router.back();
    },
    onError: (e: any) => { haptic("error"); Toast.show({ type: "error", text1: e.message }); },
  });

  if (svcQ.isLoading) return <View style={{ flex: 1, backgroundColor: colors.surface }}><Header title="" back /><Loading /></View>;
  const svc = svcQ.data;
  const disc = discountQ.data?.discount;
  const finalPrice = disc ? Math.round(svc.price * (1 - disc.percent / 100) * 100) / 100 : svc.price;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Header title={t("requestService")} back />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingBottom: 120 }} bottomOffset={120}>
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <View style={{ height: 160, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}>
            {svc.image ? (
              <Image source={{ uri: api.fileUrl(svc.image) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            ) : (
              <LinearGradient colors={[colors.brandPrimary, colors.brand]} style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="document-text-outline" size={56} color="#FFFFFF" />
              </LinearGradient>
            )}
          </View>

          <AppText weight="bold" size="2xl">{svc.name}</AppText>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: spacing.sm }}>
            <View style={{ backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill }}>
              <AppText size="sm" color={colors.brandPrimary} weight="bold">{svc.category}</AppText>
            </View>
            {svc.price > 0 ? (
              disc ? (
                <>
                  <AppText size="base" color={colors.muted} style={{ textDecorationLine: "line-through" }}>{svc.price}</AppText>
                  <AppText weight="bold" size="lg" color={colors.accent}>{finalPrice} {t("sar")}</AppText>
                  <View style={{ backgroundColor: colors.accent, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm }}>
                    <AppText size="sm" weight="bold" color={colors.onAccent}>-{Math.round(disc.percent)}%</AppText>
                  </View>
                </>
              ) : (
                <AppText weight="bold" size="lg" color={colors.brandPrimary}>{svc.price} {t("sar")}</AppText>
              )
            ) : (
              <AppText weight="bold" size="lg" color={colors.brandPrimary}>{t("onRequest")}</AppText>
            )}
          </View>
          {svc.description ? <AppText size="base" color={colors.onSurfaceSecondary}>{svc.description}</AppText> : null}

          {svc.requirements ? (
            <View testID="requirements-box" style={{ backgroundColor: colors.brandTertiary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="list-circle-outline" size={22} color={colors.accent} />
                <AppText weight="bold" size="lg">{t("requirements")}</AppText>
              </View>
              <AppText size="base" color={colors.onSurfaceSecondary} style={{ lineHeight: 26 }}>{svc.requirements}</AppText>
            </View>
          ) : null}

          <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm }} />

          <AppText weight="bold" size="lg">{t("applicantType")}</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {TYPES.map((tp) => {
              const active = applicantType === tp;
              return (
                <Pressable key={tp} testID={`type-${tp}`} onPress={() => { haptic("selection"); setApplicantType(tp); }} style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: active ? colors.brandPrimary : colors.border, backgroundColor: active ? colors.brandTertiary : colors.surfaceSecondary }}>
                  <AppText size="base" weight={active ? "bold" : "regular"} color={active ? colors.brandPrimary : colors.onSurface}>{t(tp as any)}</AppText>
                </Pressable>
              );
            })}
          </View>

          <AppText weight="bold" size="lg" style={{ marginTop: spacing.sm }}>{t("notes")}</AppText>
          <AppInput testID="notes-input" value={notes} onChangeText={setNotes} placeholder={t("notes")} multiline />
        </View>
      </KeyboardAwareScrollView>

      {/* sticky CTA */}
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: spacing.lg, paddingBottom: insets.bottom + spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
        <AppButton testID="submit-request" title={finalPrice > 0 ? `${t("submitRequest")} · ${finalPrice} ${t("sar")}` : t("submitRequest")} onPress={() => mut.mutate()} loading={mut.isPending} />
      </View>
    </View>
  );
}
