"use strict";

const { parseColor } = require("./colors");

// Every theme targets one terminal background:
//   dark-*        bright colors, dark pill text, for dark terminals
//   light-*       deep colors, white pill text, for light terminals
//   colorblind-*  Okabe–Ito based; ok / caution / danger stay distinct for
//                 protanopia, deuteranopia and tritanopia
// Palettes are checked by tests/shared/themes.test.js: pill text and lines
// text reach WCAG AA (4.5:1), and the ok / caution / danger states are
// clearly different from each other.
//
// Color roles:
//   text      pill text                  track     empty dots in lines meters
//   fiveHour  healthy state (ok)         caution   warning state
//   warn      danger / critical state    gitDirty  repo with uncommitted work
//   model, weekly, thirdParty, context, git, meta: widget colors

const hex = (value) => parseColor(value);

function theme(kind, name, description, colors) {
  const parsed = {};
  for (const [key, value] of Object.entries(colors)) {
    parsed[key] = hex(value);
  }
  return { kind, name, description, colors: parsed };
}

const DARK_TEXT = "#16161c";
const LIGHT_TEXT = "#ffffff";

const THEMES = {
  "dark-aurora": theme("dark", "Dark Aurora", "Balanced pastels (default)", {
    text: DARK_TEXT,
    track: "#4a4e5e",
    model: "#c4a7ff",
    fiveHour: "#8ee6a0",
    weekly: "#7fd6ee",
    thirdParty: "#ffb995",
    context: "#8fb4ff",
    git: "#d8c4ff",
    gitDirty: "#ffc68a",
    meta: "#bfc6d9",
    caution: "#ffd56b",
    warn: "#ff8b8b",
  }),

  "dark-ocean": theme("dark", "Dark Ocean", "Cool blues and teals", {
    text: DARK_TEXT,
    track: "#45505e",
    model: "#9fb7ff",
    fiveHour: "#6fe0c0",
    weekly: "#7cc7ff",
    thirdParty: "#a5d8ff",
    context: "#5fb0ff",
    git: "#8adfe6",
    gitDirty: "#ffbf7a",
    meta: "#b2c2d6",
    caution: "#ffd36e",
    warn: "#ff8a99",
  }),

  "dark-ember": theme("dark", "Dark Ember", "Warm coral, gold and rose", {
    text: DARK_TEXT,
    track: "#56483f",
    model: "#ffa98c",
    fiveHour: "#b4e08a",
    weekly: "#9fd9c9",
    thirdParty: "#ffc8a0",
    context: "#91c3ee",
    git: "#f5a8c8",
    gitDirty: "#ffd27e",
    meta: "#d9c8b8",
    caution: "#ffe066",
    warn: "#ff7f7f",
  }),

  "dark-forest": theme("dark", "Dark Forest", "Earthy greens and sand", {
    text: DARK_TEXT,
    track: "#45513f",
    model: "#c2c98a",
    fiveHour: "#9fdc8f",
    weekly: "#8fd1b8",
    thirdParty: "#e8c38f",
    context: "#94c0d8",
    git: "#b9d99a",
    gitDirty: "#f2c879",
    meta: "#c9cbb5",
    caution: "#f5d76e",
    warn: "#f28b82",
  }),

  "dark-neon": theme("dark", "Dark Neon", "Vivid, high-energy accents", {
    text: DARK_TEXT,
    track: "#4d4560",
    model: "#c79bff",
    fiveHour: "#5cf59a",
    weekly: "#64e4ff",
    thirdParty: "#ffaa66",
    context: "#7aa8ff",
    git: "#ff9be0",
    gitDirty: "#ffc266",
    meta: "#e6e6f0",
    caution: "#fff066",
    warn: "#ff6e6e",
  }),

  "dark-mono": theme("dark", "Dark Mono", "Grays, color only for status", {
    text: DARK_TEXT,
    track: "#4a4a4f",
    model: "#d4d4d8",
    fiveHour: "#8fd6a5",
    weekly: "#c4c4cc",
    thirdParty: "#b8b8c0",
    context: "#a8b8d0",
    git: "#cfcfd6",
    gitDirty: "#e8c88a",
    meta: "#a8a8b0",
    caution: "#ecd27a",
    warn: "#f29a9a",
  }),

  "light-paper": theme("light", "Light Paper", "Balanced inks for light terminals", {
    text: LIGHT_TEXT,
    track: "#c8ccd4",
    model: "#6a3fc0",
    fiveHour: "#1b7a3d",
    weekly: "#0e6f8a",
    thirdParty: "#a3480f",
    context: "#1f5fbf",
    git: "#5b4bb0",
    gitDirty: "#9a5a00",
    meta: "#4b5466",
    caution: "#8a5d00",
    warn: "#c0262d",
  }),

  "light-sky": theme("light", "Light Sky", "Cool blues for light terminals", {
    text: LIGHT_TEXT,
    track: "#c3cfdc",
    model: "#3a56c4",
    fiveHour: "#0f7a5c",
    weekly: "#0b6c99",
    thirdParty: "#2f5f8f",
    context: "#1d5fd6",
    git: "#25608f",
    gitDirty: "#985100",
    meta: "#46566b",
    caution: "#8c5c00",
    warn: "#c2263a",
  }),

  "light-sunset": theme("light", "Light Sunset", "Warm reds and ambers for light terminals", {
    text: LIGHT_TEXT,
    track: "#d8cbc4",
    model: "#a83c63",
    fiveHour: "#2e7a2a",
    weekly: "#1f6f7a",
    thirdParty: "#b0450f",
    context: "#3d5fa8",
    git: "#a3425e",
    gitDirty: "#8f5500",
    meta: "#6b5048",
    caution: "#946000",
    warn: "#c4211e",
  }),

  "colorblind-dark": theme(
    "colorblind",
    "Color-blind Dark",
    "Color-blind safe, for dark terminals",
    {
      text: DARK_TEXT,
      track: "#4a4e5e",
      model: "#cc99ff",
      fiveHour: "#56b4e9",
      weekly: "#88ccee",
      thirdParty: "#e69f00",
      context: "#7fb2ff",
      git: "#b8a6ff",
      gitDirty: "#e69f00",
      meta: "#c8c8c8",
      caution: "#f0e442",
      warn: "#ff7a3d",
    }
  ),

  "colorblind-light": theme(
    "colorblind",
    "Color-blind Light",
    "Color-blind safe, for light terminals",
    {
      text: LIGHT_TEXT,
      track: "#c8ccd4",
      model: "#5e3ea8",
      fiveHour: "#005a8c",
      weekly: "#1f6680",
      thirdParty: "#8a5200",
      context: "#2856a8",
      git: "#4e4596",
      gitDirty: "#8a5200",
      meta: "#4b5466",
      caution: "#876900",
      warn: "#87002d",
    }
  ),

  custom: theme("custom", "Custom", "Your own colors from statusline.config.json", {
    text: DARK_TEXT,
    track: "#4a4e5e",
    model: "#c4a7ff",
    fiveHour: "#8ee6a0",
    weekly: "#7fd6ee",
    thirdParty: "#ffb995",
    context: "#8fb4ff",
    git: "#d8c4ff",
    gitDirty: "#ffc68a",
    meta: "#bfc6d9",
    caution: "#ffd56b",
    warn: "#ff8b8b",
  }),
};

const DEFAULT_THEME = "dark-aurora";

const THEME_KINDS = [
  { id: "dark", label: "Dark terminals" },
  { id: "light", label: "Light terminals" },
  { id: "colorblind", label: "Color-blind safe" },
  { id: "custom", label: "Custom" },
];

const THEME_ORDER = [
  "dark-aurora",
  "dark-ocean",
  "dark-ember",
  "dark-forest",
  "dark-neon",
  "dark-mono",
  "light-paper",
  "light-sky",
  "light-sunset",
  "colorblind-dark",
  "colorblind-light",
  "custom",
];

// Short names shown in `theme --list`.
const THEME_ALIASES = {
  dark: "dark-aurora",
  light: "light-paper",
  colorblind: "colorblind-dark",
};

const COLOR_KEYS = [
  "text",
  "track",
  "model",
  "fiveHour",
  "weekly",
  "thirdParty",
  "context",
  "git",
  "gitDirty",
  "meta",
  "caution",
  "warn",
  // Optional: pins the background behind pill caps instead of using the
  // terminal's own background.
  "terminal",
];

function canonicalThemeId(themeId) {
  const key = String(themeId ?? "")
    .trim()
    .toLowerCase();
  return THEME_ALIASES[key] ?? key;
}

function buildCustomTheme(customThemeConfig = {}) {
  const requestedBase = canonicalThemeId(customThemeConfig.base);
  const baseId =
    THEMES[requestedBase] && requestedBase !== "custom" ? requestedBase : DEFAULT_THEME;
  const baseColors = THEMES[baseId].colors;

  const rawColors =
    customThemeConfig.colors && typeof customThemeConfig.colors === "object"
      ? customThemeConfig.colors
      : {};

  const parsedColors = { ...baseColors };

  if (rawColors && typeof rawColors === "object") {
    for (const key of COLOR_KEYS) {
      if (rawColors[key] !== undefined) {
        parsedColors[key] = parseColor(rawColors[key], baseColors[key]);
      }
    }
  }

  return {
    kind: "custom",
    name: customThemeConfig.name || "Custom",
    description: customThemeConfig.description || "User-defined color palette",
    colors: parsedColors,
  };
}

function resolveThemeId(themeId) {
  const id = canonicalThemeId(themeId);
  return THEMES[id] ? id : DEFAULT_THEME;
}

function resolveTheme(themeId, customThemeConfig) {
  const id = resolveThemeId(themeId);
  if (id === "custom") {
    return buildCustomTheme(customThemeConfig);
  }
  return THEMES[id];
}

function themeColors(themeId, customThemeConfig) {
  return resolveTheme(themeId, customThemeConfig).colors;
}

module.exports = {
  THEMES,
  THEME_ORDER,
  THEME_KINDS,
  THEME_ALIASES,
  DEFAULT_THEME,
  COLOR_KEYS,
  theme,
  canonicalThemeId,
  buildCustomTheme,
  resolveThemeId,
  resolveTheme,
  themeColors,
};
