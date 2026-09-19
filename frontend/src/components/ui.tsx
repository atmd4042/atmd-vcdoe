import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, ActivityIndicator, ScrollView,
  StyleProp, ViewStyle, TextStyle, Platform,
} from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";
import { useI18n } from "@/src/i18n";

export const FONT = "Tajawal";

export function haptic(type: "light" | "medium" | "success" | "error" | "selection" = "light") {
  if (Platform.OS === "web") return;
  try {
    if (type === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (type === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else if (type === "selection") Haptics.selectionAsync();
    else Haptics.impactAsync(type === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  } catch {}
}

// -------- Text --------
export function AppText({ children, style, weight = "regular", size = "lg", color, numberOfLines, testID }: {
  children: React.ReactNode; style?: StyleProp<TextStyle>;
  weight?: "regular" | "medium" | "bold"; size?: keyof typeof fontSize;
  color?: string; numberOfLines?: number; testID?: string;
}) {
  const { colors } = useTheme();
  const { isRTL } = useI18n();
  const fam = weight === "bold" ? "Tajawal-Bold" : weight === "medium" ? "Tajawal-Medium" : "Tajawal";
  return (
    <Text
      testID={testID}
      numberOfLines={numberOfLines}
      style={[{
        fontFamily: fam, fontSize: fontSize[size], color: color ?? colors.onSurface,
        textAlign: isRTL ? "right" : "left", writingDirection: isRTL ? "rtl" : "ltr", lineHeight: fontSize[size] * 1.6,
      }, style]}
    >
      {children}
    </Text>
  );
}

// -------- Button --------
export function AppButton({ title, onPress, variant = "primary", loading, disabled, icon, style, testID }: {
  title: string; onPress: () => void; variant?: "primary" | "secondary" | "outline" | "danger";
  loading?: boolean; disabled?: boolean; icon?: string; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  const { colors } = useTheme();
  const bg = variant === "primary" ? colors.brandPrimary
    : variant === "secondary" ? colors.brandSecondary
    : variant === "danger" ? colors.error : "transparent";
  const fg = variant === "primary" ? colors.onBrandPrimary
    : variant === "secondary" ? colors.onBrandSecondary
    : variant === "danger" ? colors.onError : colors.brandPrimary;
  const border = variant === "outline" ? { borderWidth: 1.5, borderColor: colors.brandPrimary } : {};
  return (
    <Pressable
      testID={testID}
      onPress={() => { if (!disabled && !loading) { haptic("medium"); onPress(); } }}
      disabled={disabled || loading}
      style={({ pressed }) => [{
        backgroundColor: bg, borderRadius: radius.md, minHeight: 52,
        alignItems: "center", justifyContent: "center", flexDirection: "row",
        paddingHorizontal: spacing.lg, gap: spacing.sm,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1, ...border,
      }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Ionicons name={icon as any} size={20} color={fg} /> : null}
          <Text style={{ color: fg, fontFamily: "Tajawal-Bold", fontSize: fontSize.lg }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

// -------- Input --------
export function AppInput({ value, onChangeText, placeholder, secureToggle, keyboardType, multiline, icon, testID, autoCapitalize, editable = true }: {
  value: string; onChangeText: (t: string) => void; placeholder?: string;
  secureToggle?: boolean; keyboardType?: any; multiline?: boolean; icon?: string;
  testID?: string; autoCapitalize?: any; editable?: boolean;
}) {
  const { colors } = useTheme();
  const { isRTL, t } = useI18n();
  const [hidden, setHidden] = useState(!!secureToggle);
  return (
    <View style={{
      flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center",
      backgroundColor: colors.surfaceTertiary, borderRadius: radius.md,
      borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md,
      minHeight: multiline ? 100 : 52, gap: spacing.sm,
    }}>
      {icon ? <Ionicons name={icon as any} size={20} color={colors.muted} /> : null}
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={hidden}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize ?? "none"}
        editable={editable}
        style={{
          flex: 1, fontFamily: FONT, fontSize: fontSize.lg, color: colors.onSurface,
          textAlign: isRTL ? "right" : "left", paddingVertical: multiline ? spacing.md : 0,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
      {secureToggle ? (
        <Pressable testID="toggle-password" onPress={() => setHidden((h) => !h)} hitSlop={10}>
          <Ionicons name={hidden ? "eye-outline" : "eye-off-outline"} size={20} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

// -------- Card --------
export function Card({ children, style, onPress, testID }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string;
}) {
  const { colors } = useTheme();
  const content = (
    <View testID={testID} style={[{
      backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg,
      borderWidth: 1, borderColor: colors.border,
      shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
    }, style]}>
      {children}
    </View>
  );
  if (onPress) return <Pressable onPress={() => { haptic("light"); onPress(); }} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>{content}</Pressable>;
  return content;
}

// -------- Badge --------
const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {};
export function StatusBadge({ status }: { status: string }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const map: Record<string, string> = {
    pending: colors.warning, in_progress: colors.info, completed: colors.success,
    rejected: colors.error, approved: colors.success,
  };
  const c = map[status] || colors.muted;
  return (
    <View style={{ backgroundColor: c + "22", paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" }}>
      <Text style={{ color: c, fontFamily: "Tajawal-Bold", fontSize: fontSize.sm }}>{t(status as any)}</Text>
    </View>
  );
}

// -------- IconCircle --------
export function IconCircle({ name, color, bg, size = 48 }: { name: string; color?: string; bg?: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: bg ?? colors.brandTertiary, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={name as any} size={size * 0.5} color={color ?? colors.accent} />
    </View>
  );
}

// -------- Loading / Empty / Error --------
export function Loading() {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
      <ActivityIndicator size="large" color={colors.brandPrimary} />
      <AppText color={colors.muted} size="base" style={{ marginTop: spacing.md }}>{t("loading")}</AppText>
    </View>
  );
}

export function EmptyState({ icon = "document-outline", text }: { icon?: string; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", justifyContent: "center", padding: spacing["2xl"], gap: spacing.md }}>
      <IconCircle name={icon} size={72} />
      <AppText color={colors.muted} size="base" style={{ textAlign: "center" }}>{text}</AppText>
    </View>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={{ alignItems: "center", justifyContent: "center", padding: spacing["2xl"], gap: spacing.md }}>
      <IconCircle name="alert-circle-outline" size={72} bg={colors.error + "22"} color={colors.error} />
      <AppText color={colors.muted} size="base">{t("error")}</AppText>
      <AppButton title={t("retry")} onPress={onRetry} variant="outline" style={{ paddingHorizontal: spacing.xl }} />
    </View>
  );
}

// -------- Header --------
export function Header({ title, back, right }: { title: string; back?: boolean; right?: React.ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isRTL } = useI18n();
  const router = require("expo-router").useRouter();
  return (
    <View style={{
      paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md, paddingHorizontal: spacing.lg,
      backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
      flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: spacing.md,
    }}>
      {back ? (
        <Pressable testID="back-button" onPress={() => { haptic("light"); router.back(); }} hitSlop={10}>
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={26} color={colors.onSurface} />
        </Pressable>
      ) : null}
      <AppText weight="bold" size="xl" style={{ flex: 1 }}>{title}</AppText>
      {right}
    </View>
  );
}

export { ScrollView, spacing, radius, fontSize };
