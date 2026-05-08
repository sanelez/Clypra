import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "midnight" | "ocean" | "forest";
export type FontFamily = "inter" | "system" | "mono" | "roboto" | "poppins" | "outfit";
export type FrameRate = 24 | 30 | 60;

interface SettingsStore {
  // Appearance
  theme: Theme;
  fontFamily: FontFamily;
  setTheme: (theme: Theme) => void;
  setFontFamily: (fontFamily: FontFamily) => void;
  // Editor
  snapToGrid: boolean;
  autoRipple: boolean;
  autoSave: boolean;
  defaultFrameRate: FrameRate;
  setSnapToGrid: (v: boolean) => void;
  setAutoRipple: (v: boolean) => void;
  setAutoSave: (v: boolean) => void;
  setDefaultFrameRate: (v: FrameRate) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: "dark",
      fontFamily: "inter",
      snapToGrid: true,
      autoRipple: false,
      autoSave: true,
      defaultFrameRate: 30,

      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },

      setFontFamily: (fontFamily) => {
        set({ fontFamily });
        applyFontFamily(fontFamily);
      },

      setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
      setAutoRipple: (autoRipple) => set({ autoRipple }),
      setAutoSave: (autoSave) => set({ autoSave }),
      setDefaultFrameRate: (defaultFrameRate) => set({ defaultFrameRate }),
    }),
    {
      name: "clypra-settings",
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
          applyFontFamily(state.fontFamily);
        }
      },
    },
  ),
);

// ─── Theme definitions ──────────────────────────────────────────────────────
// Each theme provides a complete set of CSS custom properties so that the
// entire editor UI updates consistently when switching.
const themes: Record<Theme, Record<string, string>> = {
  dark: {
    "--color-bg": "#0f0f0f",
    "--color-surface": "#1a1a1a",
    "--color-surface-raised": "#242424",
    "--color-surface-panel": "#161616",
    "--color-surface-floating": "#20242a",
    "--color-border": "#2e2e2e",
    "--color-border-soft": "#343b45",
    "--color-accent": "#6c63ff",
    "--color-accent-soft": "#8b84ff",
    "--color-text-primary": "#f0f0f0",
    "--color-text-muted": "#666666",
    "--color-danger": "#e05252",
    "--color-video-clip": "#2d2340",
    "--color-audio-clip": "#1a3040",
    "--color-text-clip": "#3d3010",
    // shadcn compat
    "--background": "#0f0f0f",
    "--foreground": "#f0f0f0",
    "--card": "#1a1a1a",
    "--card-foreground": "#f0f0f0",
    "--popover": "#1a1a1a",
    "--popover-foreground": "#f0f0f0",
    "--primary": "#6c63ff",
    "--primary-foreground": "#ffffff",
    "--secondary": "#242424",
    "--secondary-foreground": "#f0f0f0",
    "--muted": "#242424",
    "--muted-foreground": "#666666",
    "--accent": "#6c63ff",
    "--accent-foreground": "#ffffff",
    "--destructive": "#e05252",
    "--border": "#2e2e2e",
    "--input": "#2e2e2e",
    "--ring": "#6c63ff",
  },
  midnight: {
    "--color-bg": "#0a0e1a",
    "--color-surface": "#131829",
    "--color-surface-raised": "#1a2138",
    "--color-surface-panel": "#10152b",
    "--color-surface-floating": "#1c2340",
    "--color-border": "#252d47",
    "--color-border-soft": "#303a58",
    "--color-accent": "#5b8fff",
    "--color-accent-soft": "#7aa5ff",
    "--color-text-primary": "#e8eef7",
    "--color-text-muted": "#5a6b8c",
    "--color-danger": "#e05252",
    "--color-video-clip": "#1e2a50",
    "--color-audio-clip": "#152845",
    "--color-text-clip": "#2e3550",
    "--background": "#0a0e1a",
    "--foreground": "#e8eef7",
    "--card": "#131829",
    "--card-foreground": "#e8eef7",
    "--popover": "#131829",
    "--popover-foreground": "#e8eef7",
    "--primary": "#5b8fff",
    "--primary-foreground": "#ffffff",
    "--secondary": "#1a2138",
    "--secondary-foreground": "#e8eef7",
    "--muted": "#1a2138",
    "--muted-foreground": "#5a6b8c",
    "--accent": "#5b8fff",
    "--accent-foreground": "#ffffff",
    "--destructive": "#e05252",
    "--border": "#252d47",
    "--input": "#252d47",
    "--ring": "#5b8fff",
  },
  ocean: {
    "--color-bg": "#0a1520",
    "--color-surface": "#0f1f2e",
    "--color-surface-raised": "#16293d",
    "--color-surface-panel": "#0c1a28",
    "--color-surface-floating": "#183044",
    "--color-border": "#1e3548",
    "--color-border-soft": "#284055",
    "--color-accent": "#00d4ff",
    "--color-accent-soft": "#33ddff",
    "--color-text-primary": "#e0f2ff",
    "--color-text-muted": "#5a7a94",
    "--color-danger": "#e05252",
    "--color-video-clip": "#0f2a3d",
    "--color-audio-clip": "#0c2535",
    "--color-text-clip": "#1a3040",
    "--background": "#0a1520",
    "--foreground": "#e0f2ff",
    "--card": "#0f1f2e",
    "--card-foreground": "#e0f2ff",
    "--popover": "#0f1f2e",
    "--popover-foreground": "#e0f2ff",
    "--primary": "#00d4ff",
    "--primary-foreground": "#0a1520",
    "--secondary": "#16293d",
    "--secondary-foreground": "#e0f2ff",
    "--muted": "#16293d",
    "--muted-foreground": "#5a7a94",
    "--accent": "#00d4ff",
    "--accent-foreground": "#0a1520",
    "--destructive": "#e05252",
    "--border": "#1e3548",
    "--input": "#1e3548",
    "--ring": "#00d4ff",
  },
  forest: {
    "--color-bg": "#0d1410",
    "--color-surface": "#141d18",
    "--color-surface-raised": "#1c2820",
    "--color-surface-panel": "#111a14",
    "--color-surface-floating": "#1f2e25",
    "--color-border": "#263329",
    "--color-border-soft": "#2f3e32",
    "--color-accent": "#4ade80",
    "--color-accent-soft": "#6ee7a0",
    "--color-text-primary": "#e8f5e9",
    "--color-text-muted": "#5a7a5f",
    "--color-danger": "#e05252",
    "--color-video-clip": "#1a2e1e",
    "--color-audio-clip": "#142a1c",
    "--color-text-clip": "#2a3820",
    "--background": "#0d1410",
    "--foreground": "#e8f5e9",
    "--card": "#141d18",
    "--card-foreground": "#e8f5e9",
    "--popover": "#141d18",
    "--popover-foreground": "#e8f5e9",
    "--primary": "#4ade80",
    "--primary-foreground": "#0d1410",
    "--secondary": "#1c2820",
    "--secondary-foreground": "#e8f5e9",
    "--muted": "#1c2820",
    "--muted-foreground": "#5a7a5f",
    "--accent": "#4ade80",
    "--accent-foreground": "#0d1410",
    "--destructive": "#e05252",
    "--border": "#263329",
    "--input": "#263329",
    "--ring": "#4ade80",
  },
};

/** Human-readable metadata for each theme (used by SettingsModal) */
export const THEME_META: Record<Theme, { name: string; description: string }> = {
  dark: { name: "Dark", description: "Classic dark" },
  midnight: { name: "Midnight", description: "Deep blue tones" },
  ocean: { name: "Ocean", description: "Cool cyan accents" },
  forest: { name: "Forest", description: "Natural green hues" },
};

/** Returns the raw theme color tokens for a given theme (for live previews) */
export function getThemeColors(t: Theme) {
  return themes[t];
}

// Font family definitions
const fontFamilies: Record<FontFamily, string> = {
  inter: '"Inter Variable", sans-serif',
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", "Fira Code", Consolas, monospace',
  roboto: '"Roboto", sans-serif',
  poppins: '"Poppins", sans-serif',
  outfit: '"Outfit", sans-serif',
};

export const FONT_META: Record<FontFamily, { name: string; stack: string }> = {
  inter: { name: "Inter", stack: fontFamilies.inter },
  system: { name: "System", stack: fontFamilies.system },
  mono: { name: "Mono", stack: fontFamilies.mono },
  roboto: { name: "Roboto", stack: fontFamilies.roboto },
  poppins: { name: "Poppins", stack: fontFamilies.poppins },
  outfit: { name: "Outfit", stack: fontFamilies.outfit },
};

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const themeColors = themes[theme];

  Object.entries(themeColors).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });
}

export function applyFontFamily(fontFamily: FontFamily) {
  const root = document.documentElement;
  root.style.setProperty("--font-sans", fontFamilies[fontFamily]);
  if (document.body) {
    document.body.style.fontFamily = fontFamilies[fontFamily];
  }
}

export function initSettings() {
  const state = useSettingsStore.getState();
  applyTheme(state.theme);
  applyFontFamily(state.fontFamily);
}
