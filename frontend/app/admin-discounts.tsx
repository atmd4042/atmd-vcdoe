import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, AppButton, AppInput, Header, Card, EmptyState, spacing, radius, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { AudiencePicker } from "@/src/components/AudiencePicker";

export default function AdminDiscounts() {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [percent, setPercent] = useState("");
  const [audience, setAudience] = useState("all");
  const [target, setTarget] = useState("");

  const q = useQuery({ queryKey: ["admin-discounts"], queryFn: () => api.get("/admin/discounts") });
  const create = useMutation({
    mutationFn: () => api.post("/admin/discounts", { title, percent: parseFloat(percent), audience, target_user_id: audience === "user" ? target : null }),
    onSuccess: () => { haptic("success"); Toast.show({ type: "success", text1: t("saved") }); setTitle(""); setPercent(""); setTarget(""); qc.invalidateQueries({ queryKey: ["admin-discounts"] }); },
    onError: (e: any) => Toast.show({ type: "error", text1: e.message }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/admin/discounts/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-discounts"] }); },
  });

  const audLabel = (a: string) => a === "all" ? t("audienceAll") : a === "customers" ? t("audienceCustomers") : a === "providers" ? t("audienceProviders") : t("audienceUser");

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Header title={t("discounts")} back />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["3xl"] }} bottomOffset={20}>
        <Card style={{ gap: spacing.md }}>
          <AppText weight="bold" size="lg">{t("addDiscount")}</AppText>
          <AppInput testID="disc-title" value={title} onChangeText={setTitle} placeholder={t("title")} icon="pricetag-outline" />
          <AppInput testID="disc-percent" value={percent} onChangeText={setPercent} placeholder={t("percent")} icon="calculator-outline" keyboardType="number-pad" />
          <AudiencePicker value={audience} onChange={setAudience} />
          {audience === "user" ? <AppInput testID="disc-target" value={target} onChangeText={setTarget} placeholder={t("targetUser")} icon="person-outline" keyboardType="email-address" /> : null}
          <AppButton testID="disc-save" title={t("save")} onPress={() => create.mutate()} loading={create.isPending} disabled={!title || !percent} />
        </Card>

        {(q.data || []).map((d: any) => (
          <Card key={d.id} testID={`disc-${d.id}`} style={{ padding: spacing.md }}>
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: spacing.md }}>
                <View style={{ backgroundColor: colors.accent, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.md }}>
                  <AppText weight="bold" size="lg" color={colors.onAccent}>{Math.round(d.percent)}%</AppText>
                </View>
                <View>
                  <AppText weight="bold" size="base">{d.title}</AppText>
                  <AppText size="sm" color={colors.muted}>{audLabel(d.audience)}</AppText>
                </View>
              </View>
              <Pressable testID={`del-disc-${d.id}`} onPress={() => { haptic("medium"); del.mutate(d.id); }} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </Pressable>
            </View>
          </Card>
        ))}
        {(q.data || []).length === 0 ? <EmptyState icon="pricetag-outline" text={t("noNotifications")} /> : null}
      </KeyboardAwareScrollView>
    </View>
  );
}
