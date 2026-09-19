import React, { useState } from "react";
import { View, ScrollView, FlatList, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, Card, Loading, EmptyState, spacing, radius, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";

const ROLES = ["all", "customer", "service_provider"];

export default function AdminUsers() {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [role, setRole] = useState("all");
  const q = useQuery({ queryKey: ["admin-users", role], queryFn: () => api.get(`/admin/users?role=${role}`) });

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/admin/users/${id}`),
    onSuccess: () => { haptic("success"); Toast.show({ type: "success", text1: t("saved") }); qc.invalidateQueries({ queryKey: ["admin-users"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); },
    onError: (e: any) => Toast.show({ type: "error", text1: e.message }),
  });

  const roleLabel = (r: string) => r === "all" ? t("all") : r === "customer" ? t("asCustomer") : t("asProvider");

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.sm }}>
        <AppText weight="bold" size="xl" style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>{t("users")}</AppText>
        <View style={{ height: 56, justifyContent: "center" }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center" }}>
            {ROLES.map((r) => {
              const active = role === r;
              return (
                <Pressable key={r} testID={`role-filter-${r}`} onPress={() => { haptic("selection"); setRole(r); }} style={{ height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, justifyContent: "center", flexShrink: 0, backgroundColor: active ? colors.brandPrimary : colors.surfaceTertiary, borderWidth: 1, borderColor: active ? colors.brandPrimary : colors.border }}>
                  <AppText size="base" weight="medium" color={active ? colors.onBrandPrimary : colors.onSurfaceTertiary}>{roleLabel(r)}</AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
      {q.isLoading ? <Loading /> : (
        <FlatList
          data={q.data || []}
          keyExtractor={(i: any) => i.id}
          onRefresh={() => q.refetch()}
          refreshing={q.isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["3xl"] }}
          ListEmptyComponent={<EmptyState icon="people-outline" text={t("noRequests")} />}
          renderItem={({ item }) => (
            <Card testID={`user-${item.id}`} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: spacing.md }}>
                <View style={{ width: 46, height: 46, borderRadius: radius.pill, backgroundColor: item.role === "admin" ? colors.warning : item.role === "service_provider" ? colors.info : colors.brandPrimary, alignItems: "center", justifyContent: "center" }}>
                  <AppText color="#FFFFFF" weight="bold" size="lg">{(item.name || "?").charAt(0)}</AppText>
                </View>
                <View style={{ flex: 1 }}>
                  <AppText weight="bold" size="base" numberOfLines={1}>{item.office_name || item.name}</AppText>
                  <AppText size="sm" color={colors.muted} numberOfLines={1}>{item.email} · {item.phone}</AppText>
                </View>
                {item.role !== "admin" ? (
                  <>
                    <Pressable testID={`edit-user-${item.id}`} onPress={() => { haptic("light"); router.push({ pathname: "/admin-user-form", params: { id: item.id, name: item.name, phone: item.phone, bio: item.bio || "" } }); }} hitSlop={8} style={{ padding: 6 }}>
                      <Ionicons name="create-outline" size={22} color={colors.info} />
                    </Pressable>
                    <Pressable testID={`delete-user-${item.id}`} onPress={() => { haptic("medium"); del.mutate(item.id); }} hitSlop={8} style={{ padding: 6 }}>
                      <Ionicons name="trash-outline" size={22} color={colors.error} />
                    </Pressable>
                  </>
                ) : null}
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}
