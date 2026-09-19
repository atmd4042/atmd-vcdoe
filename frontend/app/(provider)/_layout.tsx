import { Tabs } from "expo-router";
import { tabScreenOptions, tabIcon } from "@/src/components/tabs";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/auth";
import SuspendedScreen from "@/src/components/SuspendedScreen";

export default function ProviderLayout() {
  const { t } = useI18n();
  const { user } = useAuth();

  if (user?.suspended) return <SuspendedScreen />;

  return (
    <Tabs screenOptions={tabScreenOptions()}>
      <Tabs.Screen name="index" options={{ title: t("requests"), tabBarIcon: tabIcon("briefcase-outline") }} />
      <Tabs.Screen name="more" options={{ title: t("more"), tabBarIcon: tabIcon("ellipsis-horizontal") }} />
    </Tabs>
  );
}
