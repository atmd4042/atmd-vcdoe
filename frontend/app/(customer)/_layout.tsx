import { Tabs } from "expo-router";
import { tabScreenOptions, tabIcon } from "@/src/components/tabs";
import { useI18n } from "@/src/i18n";

export default function CustomerLayout() {
  const { t } = useI18n();
  return (
    <Tabs screenOptions={tabScreenOptions()}>
      <Tabs.Screen name="index" options={{ title: t("home"), tabBarIcon: tabIcon("home-outline") }} />
      <Tabs.Screen name="services" options={{ title: t("services"), tabBarIcon: tabIcon("grid-outline") }} />
      <Tabs.Screen name="requests" options={{ title: t("requests"), tabBarIcon: tabIcon("receipt-outline") }} />
      <Tabs.Screen name="more" options={{ title: t("more"), tabBarIcon: tabIcon("ellipsis-horizontal") }} />
    </Tabs>
  );
}
