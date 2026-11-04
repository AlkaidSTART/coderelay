import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  DEFAULT_THEME_PRESET_ID,
  THEME_PRESETS,
  THEME_PRESET_IDS,
  isThemePresetId,
} from "../types";
import {
  applyThemeToDocument,
  getInitialThemePreset,
  getThemeColorSchemeMode,
  persistThemePreset,
  resolveEffectiveTheme,
  THEME_STORAGE_KEY,
  useThemeStore,
} from "./themeStore";

class MockStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe("Theme system SSOT & type guard", () => {
  it("maintains SSOT with THEME_PRESET_IDS and defaults to light (white)", () => {
    expect(THEME_PRESET_IDS).toEqual([
      "light",
      "dark",
      "midnight",
      "warm",
      "slate",
      "system",
    ]);
    expect(DEFAULT_THEME_PRESET_ID).toBe("light");
  });

  it("validates isThemePresetId type guard with valid non-empty and boundary values", () => {
    // Valid values
    for (const id of THEME_PRESET_IDS) {
      expect(isThemePresetId(id)).toBe(true);
    }

    // Boundary & invalid values
    expect(isThemePresetId("")).toBe(false);
    expect(isThemePresetId("LIGHT")).toBe(false);
    expect(isThemePresetId("dark ")).toBe(false);
    expect(isThemePresetId("cyberpunk")).toBe(false);
    expect(isThemePresetId(null)).toBe(false);
    expect(isThemePresetId(undefined)).toBe(false);
    expect(isThemePresetId(0)).toBe(false);
    expect(isThemePresetId(100)).toBe(false);
    expect(isThemePresetId({})).toBe(false);
    expect(isThemePresetId([])).toBe(false);
  });

  it("guarantees non-empty metadata and valid preview color tokens for all presets", () => {
    expect(THEME_PRESETS.length).toBe(THEME_PRESET_IDS.length);

    for (const preset of THEME_PRESETS) {
      expect(isThemePresetId(preset.id)).toBe(true);
      expect(preset.name.trim().length).toBeGreaterThan(0);
      expect(preset.subtitle.trim().length).toBeGreaterThan(0);
      expect(preset.description.trim().length).toBeGreaterThan(0);

      // Verify non-empty preview colors
      const { canvas, sidebar, surface, ink, accent, border } = preset.preview;
      expect(canvas.trim().length).toBeGreaterThan(0);
      expect(sidebar.trim().length).toBeGreaterThan(0);
      expect(surface.trim().length).toBeGreaterThan(0);
      expect(ink.trim().length).toBeGreaterThan(0);
      expect(accent.trim().length).toBeGreaterThan(0);
      expect(border.trim().length).toBeGreaterThan(0);

      // Mode validation
      if (preset.id === "system") {
        expect(preset.mode).toBe("system");
      } else if (preset.id === "light" || preset.id === "warm") {
        expect(preset.mode).toBe("light");
      } else {
        expect(preset.mode).toBe("dark");
      }
    }
  });
});

describe("Theme resolution logic", () => {
  it("resolves fixed presets directly regardless of system scheme", () => {
    expect(resolveEffectiveTheme("light", "dark")).toBe("light");
    expect(resolveEffectiveTheme("dark", "light")).toBe("dark");
    expect(resolveEffectiveTheme("midnight", "light")).toBe("midnight");
    expect(resolveEffectiveTheme("warm", "dark")).toBe("warm");
    expect(resolveEffectiveTheme("slate", "light")).toBe("slate");
  });

  it("resolves system preset dynamically based on system color scheme", () => {
    expect(resolveEffectiveTheme("system", "light")).toBe("light");
    expect(resolveEffectiveTheme("system", "dark")).toBe("dark");
  });

  it("accurately categorizes colorScheme modes", () => {
    expect(getThemeColorSchemeMode("light")).toBe("light");
    expect(getThemeColorSchemeMode("warm")).toBe("light");
    expect(getThemeColorSchemeMode("dark")).toBe("dark");
    expect(getThemeColorSchemeMode("midnight")).toBe("dark");
    expect(getThemeColorSchemeMode("slate")).toBe("dark");
  });
});

describe("Theme DOM application & localStorage persistence", () => {
  let mockStorage: MockStorage;
  const mockAttrs = new Map<string, string>();
  const origWindow = globalThis.window;
  const origDocument = globalThis.document;

  beforeEach(() => {
    mockStorage = new MockStorage();
    mockAttrs.clear();

    const mockDoc = {
      documentElement: {
        setAttribute: (name: string, value: string) => mockAttrs.set(name, value),
        getAttribute: (name: string) => mockAttrs.get(name) ?? null,
        removeAttribute: (name: string) => mockAttrs.delete(name),
        style: { colorScheme: "" },
      },
    };

    const mockWin = {
      localStorage: mockStorage,
      matchMedia: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    };

    globalThis.window = mockWin as unknown as Window & typeof globalThis;
    globalThis.document = mockDoc as unknown as Document;
    globalThis.localStorage = mockStorage;
  });

  afterEach(() => {
    globalThis.window = origWindow;
    globalThis.document = origDocument;
    // @ts-expect-error cleanup mock
    delete globalThis.localStorage;
  });

  it("applies theme attributes directly to documentElement", () => {
    const resDark = applyThemeToDocument("dark", "light");
    expect(resDark.effectiveTheme).toBe("dark");
    expect(resDark.colorScheme).toBe("dark");
    expect(mockAttrs.get("data-theme")).toBe("dark");
    expect(mockAttrs.get("data-theme-preset")).toBe("dark");
    expect(mockAttrs.get("data-theme-mode")).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    const resWarm = applyThemeToDocument("warm", "dark");
    expect(resWarm.effectiveTheme).toBe("warm");
    expect(resWarm.colorScheme).toBe("light");
    expect(mockAttrs.get("data-theme")).toBe("warm");
    expect(mockAttrs.get("data-theme-preset")).toBe("warm");
    expect(mockAttrs.get("data-theme-mode")).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");

    const resSystem = applyThemeToDocument("system", "dark");
    expect(resSystem.effectiveTheme).toBe("dark");
    expect(resSystem.colorScheme).toBe("dark");
    expect(mockAttrs.get("data-theme")).toBe("dark");
    expect(mockAttrs.get("data-theme-preset")).toBe("system");
    expect(mockAttrs.get("data-theme-mode")).toBe("dark");
  });

  it("reads and persists theme preset in localStorage safely with fallback", () => {
    // When empty, returns default light theme
    expect(getInitialThemePreset()).toBe("light");

    // Persist and read back
    persistThemePreset("midnight");
    expect(mockStorage.getItem(THEME_STORAGE_KEY)).toBe("midnight");
    expect(getInitialThemePreset()).toBe("midnight");

    // Invalid or corrupted value falls back to default light theme
    mockStorage.setItem(THEME_STORAGE_KEY, "corrupted_theme_xyz");
    expect(getInitialThemePreset()).toBe("light");

    mockStorage.setItem(THEME_STORAGE_KEY, "");
    expect(getInitialThemePreset()).toBe("light");
  });

  it("updates store and document when setPreset is invoked", () => {
    useThemeStore.getState().setPreset("warm");
    expect(useThemeStore.getState().preset).toBe("warm");
    expect(useThemeStore.getState().effectiveTheme).toBe("warm");
    expect(useThemeStore.getState().colorScheme).toBe("light");
    expect(mockStorage.getItem(THEME_STORAGE_KEY)).toBe("warm");
    expect(mockAttrs.get("data-theme")).toBe("warm");

    useThemeStore.getState().setPreset("slate");
    expect(useThemeStore.getState().preset).toBe("slate");
    expect(useThemeStore.getState().effectiveTheme).toBe("slate");
    expect(useThemeStore.getState().colorScheme).toBe("dark");
    expect(mockStorage.getItem(THEME_STORAGE_KEY)).toBe("slate");
    expect(mockAttrs.get("data-theme")).toBe("slate");

    // Reset back to default light theme
    useThemeStore.getState().setPreset("light");
    expect(useThemeStore.getState().preset).toBe("light");
    expect(useThemeStore.getState().effectiveTheme).toBe("light");
    expect(useThemeStore.getState().colorScheme).toBe("light");
    expect(mockStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(mockAttrs.get("data-theme")).toBe("light");
  });
});
