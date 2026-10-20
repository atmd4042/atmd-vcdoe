import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { LogBox, View, Platform } from "react-native";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import Toast from "react-native-toast-message";
import { StatusBar } from "expo-status-bar";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { LanguageProvider } from "@/src/i18n";
import { AuthProvider } from "@/src/auth";
import PushRegistrar from "@/src/components/PushRegistrar";
import { storage } from "@/src/utils/storage";

LogBox.ignoreAllLogs(true);

// Push: foreground handler (module scope, native only)
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Push: Android channel (module scope)
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

export default function RootLayout() {
  const router = useRouter();
  const [loaded, error] = useFonts({
    Tajawal: "https://fonts.gstatic.com/s/tajawal/v9/Iurf6YBj_oCad4k1l5qjHrZpbg.ttf",
    "Tajawal-Medium": "https://fonts.gstatic.com/s/tajawal/v9/Iura6YBj_oCad4k1rzaLCr5IlLA.ttf",
    "Tajawal-Bold": "https://fonts.gstatic.com/s/tajawal/v9/Iura6YBj_oCad4k1rzaLDr7IlLA.ttf",
  });

  useEffect(() => {
    if (Platform.OS === "web") return;

    const openUrl = (data: any) => {
      const url = data?.deeplink || data?.action_url;
      if (!url) return;
      url.startsWith("http") ? Linking.openURL(url) : router.push(url);
    };

    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      openUrl(response.notification.request.content.data || {});
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openUrl(response.notification.request.content.data || {});
    });

    (async () => {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status !== "denied" || canAskAgain) return;
      const last = await storage.getItem<string>("pushNudgeAt", "");
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      if (last && Date.now() - Number(last) <= oneWeek) return;
      await storage.setItem("pushNudgeAt", String(Date.now()));
      Linking.openSettings();
    })();

    return () => { tapSub.remove(); };
  }, [router]);

  if (!loaded && !error) {
    return <View style={{ flex: 1, backgroundColor: "#FAFAFA" }} />;
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <BottomSheetModalProvider>
              <KeyboardProvider>
                <LanguageProvider>
                  <AuthProvider>
                    <PushRegistrar />
                    <StatusBar style="dark" />
                    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FAFAFA" } }} />
                    <Toast />
                  </AuthProvider>
                </LanguageProvider>
              </KeyboardProvider>
            </BottomSheetModalProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
