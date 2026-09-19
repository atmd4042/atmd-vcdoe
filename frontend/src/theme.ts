// Design tokens for اعتمد (Aetamd). Palm-green e-services identity.
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FAFAFA",
  onSurface: "#141416",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#3A3A3C",
  surfaceTertiary: "#F4F2EC",
  onSurfaceTertiary: "#4B4740",
  surfaceInverse: "#141416",
  onSurfaceInverse: "#F9FAFB",
  muted: "#8A8A8E",

  brand: "#2A2A2E",
  onBrand: "#FFFFFF",
  brandPrimary: "#141416",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FBF0D2",
  onBrandSecondary: "#7A5B00",
  brandTertiary: "#FBF4E4",
  onBrandTertiary: "#7A5B00",

  accent: "#E7A50A",
  onAccent: "#141416",

  success: "#16A34A",
  onSuccess: "#FFFFFF",
  warning: "#E7A50A",
  onWarning: "#141416",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#3B82F6",
  onInfo: "#FFFFFF",

  border: "#E7E4DC",
  borderStrong: "#D6D2C8",
  divider: "#F1EEE7",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 } as const;
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 } as const;
export const fontSize = { sm: 12, base: 14, lg: 16, xl: 20, "2xl": 24, "3xl": 30 } as const;
