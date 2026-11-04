import { create } from "zustand";
import {
  DEFAULT_THEME_PRESET_ID,
  isThemePresetId,
  type ThemePresetId,
} from "../types";

export const THEME_STORAGE_KEY = "coderelay_theme_preset";

export type ResolvedTheme = Exclude<ThemePresetId, "system">;
export type ColorSchemeMode = "light" | "dark";

export interface ThemeState {
  preset: ThemePresetId;
  effectiveTheme: ResolvedTheme;
  colorScheme: ColorSchemeMode;
  setPreset: (preset: ThemePresetId) => void;
}

export function getSystemColorScheme(): ColorSchemeMode {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveEffectiveTheme(
  preset: ThemePresetId,
  systemMode: ColorSchemeMode = getSystemColorScheme(),
): ResolvedTheme {
  if (preset === "system") {
    return systemMode === "dark" ? "dark" : "light";
  }
  return preset;
}

export function getThemeColorSchemeMode(theme: ResolvedTheme): ColorSchemeMode {
  switch (theme) {
    case "dark":
    case "midnight":
    case "slate":
      return "dark";
    case "light":
    case "warm":
    default:
      return "light";
  }
}

export function applyThemeToDocument(
  preset: ThemePresetId,
  systemMode: ColorSchemeMode = getSystemColorScheme(),
): { effectiveTheme: ResolvedTheme; colorScheme: ColorSchemeMode } {
  const effectiveTheme = resolveEffectiveTheme(preset, systemMode);
  const colorScheme = getThemeColorSchemeMode(effectiveTheme);

  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.setAttribute("data-theme", effectiveTheme);
    document.documentElement.setAttribute("data-theme-preset", preset);
    document.documentElement.setAttribute("data-theme-mode", colorScheme);
    document.documentElement.style.colorScheme = colorScheme;
  }

  return { effectiveTheme, colorScheme };
}

export function getInitialThemePreset(): ThemePresetId {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_THEME_PRESET_ID;
  }
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && isThemePresetId(stored)) {
      return stored;
    }
    return DEFAULT_THEME_PRESET_ID;
  } catch {
    return DEFAULT_THEME_PRESET_ID;
  }
}

export function persistThemePreset(preset: ThemePresetId): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preset);
  } catch {
    // ignore quota/security errors
  }
}

const initialPreset = getInitialThemePreset();
const initialResolved = applyThemeToDocument(initialPreset);

export const useThemeStore = create<ThemeState>((set, get) => ({
  preset: initialPreset,
  effectiveTheme: initialResolved.effectiveTheme,
  colorScheme: initialResolved.colorScheme,

  setPreset: (preset: ThemePresetId) => {
    persistThemePreset(preset);
    const { effectiveTheme, colorScheme } = applyThemeToDocument(preset);
    set({ preset, effectiveTheme, colorScheme });
  },
}));

// Set up system preference listener
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleMediaChange = (event: MediaQueryListEvent) => {
    const currentPreset = useThemeStore.getState().preset;
    if (currentPreset === "system") {
      const systemMode = event.matches ? "dark" : "light";
      const { effectiveTheme, colorScheme } = applyThemeToDocument(
        "system",
        systemMode,
      );
      useThemeStore.setState({ effectiveTheme, colorScheme });
    }
  };

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", handleMediaChange);
  } else if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(handleMediaChange);
  }
}
