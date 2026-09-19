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

export default function AdminNotes() {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");
  const [target, setTarget] = useState("");

  const q = useQuery({ queryKey: ["admin-notes"], queryFn: () => api.get("/admin/notes") });
  const create = useMutation({
    mutationFn: () => api.post("/admin/notes", { title, body, audience, target_user_id: audience === "user" ? target : null }),
    onSuccess: () => { haptic("success"); Toast.show({ type: "success", text1: t("saved") }); setTitle(""); setBody(""); setTarget(""); qc.invalidateQueries({ queryKey: ["admin-notes"] }); },
    onError: (e: any) => Toast.show({ type: "error", text1: e.message }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/admin/notes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-notes"] }); },
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Header title={t("announcements")} back />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["3xl"] }} bottomOffset={20}>
        <Card style={{ gap: spacing.md }}>
          <AppText weight="bold" size="lg">{t("addNote")}</AppText>
          <AppInput testID="note-title" value={title} onChangeText={setTitle} placeholder={t("title")} icon="text-outline" />
          <AppInput testID="note-body" value={body} onChangeText={setBody} placeholder={t("message")} multiline />
          <AudiencePicker value={audience} onChange={setAudience} />
          {audience === "user" ? <AppInput testID="note-target" value={target} onChangeText={setTarget} placeholder={t("targetUser")} icon="person-outline" keyboardType="email-address" /> : null}
          <AppButton testID="note-save" title={t("save")} onPress={() => create.mutate()} loading={create.isPending} disabled={!title || !body} />
        </Card>

        {(q.data || []).map((n: any) => (
          <Card key={n.id} testID={`note-${n.id}`} style={{ padding: spacing.md }}>
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <AppText weight="bold" size="base">{n.title}</AppText>
                <AppText size="sm" color={colors.muted}>{n.body}</AppText>
              </View>
              <Pressable testID={`del-note-${n.id}`} onPress={() => { haptic("medium"); del.mutate(n.id); }} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </Pressable>
            </View>
          </Card>
        ))}
        {(q.data || []).length === 0 ? <EmptyState icon="megaphone-outline" text={t("noNotifications")} /> : null}
      </KeyboardAwareScrollView>
    </View>
  );
}
