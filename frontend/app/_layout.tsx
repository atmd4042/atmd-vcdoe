import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { LogBox, View } from "react-native";
import { useFonts } from "expo-font";
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

LogBox.ignoreAllLogs(true);

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Tajawal: "https://fonts.gstatic.com/s/tajawal/v9/Iurf6YBj_oCad4k1l5qjHrZpbg.ttf",
    "Tajawal-Medium": "https://fonts.gstatic.com/s/tajawal/v9/Iura6YBj_oCad4k1rzaLCr5IlLA.ttf",
    "Tajawal-Bold": "https://fonts.gstatic.com/s/tajawal/v9/Iura6YBj_oCad4k1rzaLDr7IlLA.ttf",
  });

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
