import { Tabs } from "expo-router";
import { tabScreenOptions, tabIcon } from "@/src/components/tabs";
import { useI18n } from "@/src/i18n";

export default function AdminLayout() {
  const { t } = useI18n();
  return (
    <Tabs screenOptions={tabScreenOptions()}>
      <Tabs.Screen name="index" options={{ title: t("dashboard"), tabBarIcon: tabIcon("grid-outline") }} />
      <Tabs.Screen name="services" options={{ title: t("services"), tabBarIcon: tabIcon("cube-outline") }} />
      <Tabs.Screen name="providers" options={{ title: t("providers"), tabBarIcon: tabIcon("business-outline") }} />
      <Tabs.Screen name="users" options={{ title: t("users"), tabBarIcon: tabIcon("people-outline") }} />
    </Tabs>
  );
}
