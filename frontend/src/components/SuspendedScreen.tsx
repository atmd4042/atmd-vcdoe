import React from "react";
import { View, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppText, AppButton, spacing, radius, haptic } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/auth";

export default function SuspendedScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: colors.brandPrimary, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.lg }}>
        <View style={{ width: 96, height: 96, borderRadius: radius.lg, backgroundColor: "#FFFFFF14", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="lock-closed" size={52} color={colors.accent} />
        </View>
        <AppText color="#FFFFFF" weight="bold" size="2xl" style={{ textAlign: "center" }}>{t("suspendedMsg")}</AppText>
        <AppButton
          testID="contact-admin-wa"
          title={t("contactAdmin")}
          icon="logo-whatsapp"
          variant="secondary"
          onPress={() => { haptic("medium"); Linking.openURL("https://wa.me/966559384584"); }}
          style={{ alignSelf: "stretch" }}
        />
        <AppButton
          testID="suspended-logout"
          title={t("logout")}
          variant="danger"
          onPress={async () => { await signOut(); router.replace("/(auth)/login"); }}
          style={{ alignSelf: "stretch" }}
        />
      </View>
    </View>
  );
}
