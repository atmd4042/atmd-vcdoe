import React, { useState, useRef, useEffect } from "react";
import { View, FlatList, Pressable, TextInput } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, Header, EmptyState, spacing, radius, haptic, FONT } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

export default function Chat() {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const [text, setText] = useState("");
  const listRef = useRef<FlatList>(null);

  const reqQ = useQuery({ queryKey: ["request", requestId], queryFn: () => api.get(`/requests/${requestId}`) });
  const msgQ = useQuery({ queryKey: ["messages", requestId], queryFn: () => api.get(`/requests/${requestId}/messages`), refetchInterval: 4000 });

  const send = useMutation({
    mutationFn: (body: string) => api.post(`/requests/${requestId}/messages`, { text: body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["messages", requestId] }); },
  });

  const onSend = () => {
    const body = text.trim();
    if (!body) return;
    haptic("light");
    setText("");
    send.mutate(body);
  };

  const messages = msgQ.data || [];
  useEffect(() => {
    if (messages.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  const other = reqQ.data
    ? (user?.role === "customer" ? (reqQ.data.assigned_provider_name || t("providers")) : reqQ.data.customer_name)
    : "";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Header title={reqQ.data ? `${reqQ.data.service_name}` : t("chat")} back />
      {other ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.brandTertiary, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <AppText size="sm" color={colors.onBrandTertiary}>{other}</AppText>
        </View>
      ) : null}

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={0}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(i: any) => i.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, flexGrow: 1 }}
          ListEmptyComponent={!msgQ.isLoading ? <EmptyState icon="chatbubbles-outline" text={t("noMessages")} /> : null}
          renderItem={({ item }) => {
            const mine = item.sender_id === user?.id;
            const isAdmin = item.sender_role === "admin";
            return (
              <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                {!mine ? <AppText size="sm" color={colors.muted} style={{ marginBottom: 2, marginHorizontal: 6 }}>{isAdmin ? t("admin") : item.sender_name}</AppText> : null}
                <View style={{ backgroundColor: mine ? colors.brandPrimary : isAdmin ? colors.accent : colors.surfaceSecondary, borderWidth: mine ? 0 : 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, borderBottomRightRadius: mine ? 4 : radius.lg, borderBottomLeftRadius: mine ? radius.lg : 4 }}>
                  <AppText size="base" color={mine ? colors.onBrandPrimary : isAdmin ? colors.onAccent : colors.onSurface}>{item.text}</AppText>
                </View>
              </View>
            );
          }}
        />

        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
          <TextInput
            testID="chat-input"
            value={text}
            onChangeText={setText}
            placeholder={t("typeMessage")}
            placeholderTextColor={colors.muted}
            multiline
            style={{ flex: 1, maxHeight: 100, fontFamily: FONT, fontSize: 15, color: colors.onSurface, backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingTop: 10, paddingBottom: 10, textAlign: isRTL ? "right" : "left" }}
          />
          <Pressable testID="chat-send" onPress={onSend} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={22} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
