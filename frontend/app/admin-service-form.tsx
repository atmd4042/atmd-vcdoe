import React, { useState, useEffect } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, AppButton, AppInput, Header, spacing, radius, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { pickImageAndUpload } from "@/src/imagePicker";

export default function AdminServiceForm() {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [featured, setFeatured] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const catsQ = useQuery({ queryKey: ["categories"], queryFn: () => api.get("/categories") });
  const svcQ = useQuery({ queryKey: ["service", id], queryFn: () => api.get(`/services/${id}`), enabled: editing });

  useEffect(() => {
    if (svcQ.data) {
      setName(svcQ.data.name); setCategory(svcQ.data.category);
      setPrice(svcQ.data.price ? String(svcQ.data.price) : ""); setDescription(svcQ.data.description || "");
      setRequirements(svcQ.data.requirements || ""); setFeatured(!!svcQ.data.featured);
      setImage(svcQ.data.image || null);
    }
  }, [svcQ.data]);

  useEffect(() => {
    if (!editing && !category && catsQ.data?.length) setCategory(catsQ.data[0].name);
  }, [catsQ.data, editing, category]);

  const uploadImg = async (source: "camera" | "gallery") => {
    const path = await pickImageAndUpload(source, false);
    if (path) { setImage(path); haptic("success"); }
  };

  const save = async () => {
    if (!name || !category) { Toast.show({ type: "error", text1: "الاسم والقسم مطلوبان" }); return; }
    setSaving(true);
    try {
      const body = { name, category, price: parseFloat(price) || 0, description, requirements, featured, image, requires_provider_type: true };
      if (editing) await api.put(`/admin/services/${id}`, body);
      else await api.post("/admin/services", body);
      haptic("success");
      Toast.show({ type: "success", text1: t("saved") });
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      router.back();
    } catch (e: any) { haptic("error"); Toast.show({ type: "error", text1: e.message }); }
    finally { setSaving(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Header title={editing ? t("editService") : t("addService")} back />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["3xl"] }} bottomOffset={20}>
        <Pressable testID="service-image-picker" onPress={() => uploadImg("gallery")} style={{ height: 150, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, borderStyle: "dashed", backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {image ? <Image source={{ uri: api.fileUrl(image) }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : (
            <>
              <Ionicons name="image-outline" size={36} color={colors.muted} />
              <AppText size="sm" color={colors.muted} style={{ marginTop: spacing.sm }}>{t("serviceImage")}</AppText>
            </>
          )}
        </Pressable>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <AppButton title={t("fromCamera")} icon="camera-outline" variant="outline" onPress={() => uploadImg("camera")} style={{ flex: 1 }} />
          <AppButton title={t("fromGallery")} icon="images-outline" variant="outline" onPress={() => uploadImg("gallery")} style={{ flex: 1 }} />
        </View>

        <AppText size="sm" color={colors.muted}>{t("serviceName")}</AppText>
        <AppInput testID="service-name" value={name} onChangeText={setName} placeholder={t("serviceName")} icon="text-outline" />

        <AppText size="sm" color={colors.muted}>{t("category")}</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, flexDirection: isRTL ? "row-reverse" : "row" }}>
          {(catsQ.data || []).map((c: any) => {
            const active = category === c.name;
            return (
              <Pressable key={c.id} testID={`cat-pick-${c.id}`} onPress={() => { haptic("selection"); setCategory(c.name); }} style={{ height: 40, paddingHorizontal: spacing.lg, borderRadius: radius.pill, justifyContent: "center", flexShrink: 0, backgroundColor: active ? colors.brandPrimary : colors.surfaceTertiary, borderWidth: 1, borderColor: active ? colors.brandPrimary : colors.border }}>
                <AppText size="base" weight="medium" color={active ? colors.onBrandPrimary : colors.onSurfaceTertiary}>{c.name}</AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        <AppText size="sm" color={colors.muted}>{t("price")} ({t("optional")})</AppText>
        <AppInput testID="service-price" value={price} onChangeText={setPrice} placeholder={t("onRequest")} icon="cash-outline" keyboardType="number-pad" />

        <AppText size="sm" color={colors.muted}>{t("description")}</AppText>
        <AppInput testID="service-description" value={description} onChangeText={setDescription} placeholder={t("description")} multiline />

        <AppText size="sm" color={colors.muted}>{t("requirements")}</AppText>
        <AppInput testID="service-requirements" value={requirements} onChangeText={setRequirements} placeholder={t("requirements")} multiline />

        <Pressable testID="service-featured" onPress={() => { haptic("selection"); setFeatured((f) => !f); }} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm }}>
          <Ionicons name={featured ? "checkbox" : "square-outline"} size={24} color={featured ? colors.accent : colors.muted} />
          <AppText size="base">{t("mostRequested")}</AppText>
        </Pressable>

        <AppButton testID="service-save" title={t("save")} onPress={save} loading={saving} style={{ marginTop: spacing.md }} />
      </KeyboardAwareScrollView>
    </View>
  );
}
