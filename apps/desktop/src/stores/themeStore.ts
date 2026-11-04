import { create } from "zustand";
import {
  DEFAULT_THEME_PRESET_ID,
  isThemePresetId,
  type ThemePresetId,
} from "../types";

export const THEME_STORAGE_KEY = "coderelay_theme_preset";
export const THEME_BG_STORAGE_KEY = "coderelay_custom_background";
export const THEME_BG_OPACITY_STORAGE_KEY = "coderelay_custom_bg_opacity";
export const DEFAULT_BG_OPACITY = 0.25;

export type ResolvedTheme = Exclude<ThemePresetId, "system">;
export type ColorSchemeMode = "light" | "dark";

export interface ThemeState {
  preset: ThemePresetId;
  effectiveTheme: ResolvedTheme;
  colorScheme: ColorSchemeMode;
  customBackground: string | null;
  customBackgroundOpacity: number;
  setPreset: (preset: ThemePresetId) => void;
  setCustomBackground: (backgroundUrl: string | null) => void;
  setCustomBackgroundOpacity: (opacity: number) => void;
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
    case "cyan":
    case "sky":
    case "pink":
    case "red":
    default:
      return "light";
  }
}

export function applyThemeToDocument(
  preset: ThemePresetId,
  systemMode: ColorSchemeMode = getSystemColorScheme(),
  customBg: string | null = getInitialCustomBackground(),
): { effectiveTheme: ResolvedTheme; colorScheme: ColorSchemeMode } {
  const effectiveTheme = resolveEffectiveTheme(preset, systemMode);
  const colorScheme = getThemeColorSchemeMode(effectiveTheme);

  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.setAttribute("data-theme", effectiveTheme);
    document.documentElement.setAttribute("data-theme-preset", preset);
    document.documentElement.setAttribute("data-theme-mode", colorScheme);
    document.documentElement.style.colorScheme = colorScheme;
    if (customBg) {
      document.documentElement.setAttribute("data-has-custom-bg", "true");
    } else {
      document.documentElement.removeAttribute("data-has-custom-bg");
    }
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

export function getInitialCustomBackground(): string | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    return window.localStorage.getItem(THEME_BG_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function getInitialCustomBackgroundOpacity(): number {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_BG_OPACITY;
  }
  try {
    const stored = window.localStorage.getItem(THEME_BG_OPACITY_STORAGE_KEY);
    if (stored !== null) {
      const val = Number.parseFloat(stored);
      if (!Number.isNaN(val) && val >= 0.05 && val <= 1) {
        return val;
      }
    }
    return DEFAULT_BG_OPACITY;
  } catch {
    return DEFAULT_BG_OPACITY;
  }
}

export function persistCustomBackground(bg: string | null): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    if (bg) {
      window.localStorage.setItem(THEME_BG_STORAGE_KEY, bg);
    } else {
      window.localStorage.removeItem(THEME_BG_STORAGE_KEY);
    }
  } catch {
    // ignore quota/security errors
  }
}

export function persistCustomBackgroundOpacity(opacity: number): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(THEME_BG_OPACITY_STORAGE_KEY, String(opacity));
  } catch {
    // ignore errors
  }
}

const initialPreset = getInitialThemePreset();
const initialBg = getInitialCustomBackground();
const initialBgOpacity = getInitialCustomBackgroundOpacity();
const initialResolved = applyThemeToDocument(initialPreset, undefined, initialBg);

export const useThemeStore = create<ThemeState>((set, get) => ({
  preset: initialPreset,
  effectiveTheme: initialResolved.effectiveTheme,
  colorScheme: initialResolved.colorScheme,
  customBackground: initialBg,
  customBackgroundOpacity: initialBgOpacity,

  setPreset: (preset: ThemePresetId) => {
    persistThemePreset(preset);
    const { effectiveTheme, colorScheme } = applyThemeToDocument(
      preset,
      undefined,
      get().customBackground,
    );
    set({ preset, effectiveTheme, colorScheme });
  },

  setCustomBackground: (backgroundUrl: string | null) => {
    persistCustomBackground(backgroundUrl);
    if (typeof document !== "undefined" && document.documentElement) {
      if (backgroundUrl) {
        document.documentElement.setAttribute("data-has-custom-bg", "true");
      } else {
        document.documentElement.removeAttribute("data-has-custom-bg");
      }
    }
    set({ customBackground: backgroundUrl });
  },

  setCustomBackgroundOpacity: (opacity: number) => {
    persistCustomBackgroundOpacity(opacity);
    set({ customBackgroundOpacity: opacity });
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
