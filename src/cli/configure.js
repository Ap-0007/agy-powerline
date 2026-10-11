const readline = require("readline");
const { spawn } = require("child_process");
const {
  InvalidConfigError,
  saveConfig,
  setConfigDir,
  getConfigPath,
  WIDGET_CATALOG,
  THEMES,
  THEME_ORDER,
  LAYOUTS,
  LAYOUT_ORDER,
  widgetLabel,
  renderStatusline,
  sampleData,
  defaultConfig,
  mergeConfig,
  themeColors,
  PRESETS,
  PRESET_ORDER,
  applyPreset,
} = require("../lib/shared");
const { resolveInstallDir } = require("../lib/paths");
const { loadEditableConfig } = require("./config-guard");
const {
  parseColor,
  fg,
  setActiveDepth,
  getActiveDepth,
  resolveColorDepth,
} = require("../lib/colors");
const { makeUi } = require("./tui-style");
const {
  STYLES,
  STYLE_ORDER,
  SLOT_PRESETS,
  INVERTED_BY_DEFAULT,
  MAX_GLYPHS,
  normalizePowerline,
  applyStyle,
  detectStyle,
  parseGlyph,
  glyphChar,
  glyphName,
} = require("../lib/powerline");

const REPO_URL = "https://github.com/wassim-azi/agy-powerline";

const CSI = "\x1b[";
const RESET = `${CSI}0m`;
const BOLD = `${CSI}1m`;
const HIDE = `${CSI}?25l`;
const SHOW = `${CSI}?25h`;
const ALT_ON = `${CSI}?1049h`;
const ALT_OFF = `${CSI}?1049l`;
const HOME_CLEAR = `${CSI}H${CSI}J`;

const { version: VERSION } = require("../../package.json");

const CUSTOM_COLOR_SLOTS = [
  { key: "model", label: "Model" },
  { key: "fiveHour", label: "5h Quota" },
  { key: "weekly", label: "7d Quota" },
  { key: "context", label: "Context Window" },
  { key: "git", label: "VCS Git" },
  { key: "meta", label: "Metadata & Details" },
  { key: "caution", label: "Caution (getting low)" },
  { key: "warn", label: "Danger (critical)" },
];

const CURATED_HEX_PALETTE = [
  "#bd93f9", // Purple
  "#50fa7b", // Green
  "#ffb86c", // Orange
  "#ff79c6", // Pink
  "#f1fa8c", // Yellow
  "#ff5555", // Red
  "#8be9fd", // Cyan
  "#f8f8f2", // White
  "#6272a4", // Slate
  "#e06c75", // Coral
  "#98c379", // Mint
  "#61afef", // Sky
];

// Rows of the Powerline screen; rows with a slot open the glyph editor.
const POWERLINE_ROWS = [
  { id: "enabled", label: "Join adjacent widgets" },
  { id: "rowGap", label: "Space between rows" },
  { id: "style", label: "Style" },
  { id: "separators", label: "Separators", slot: "separator" },
  { id: "startCaps", label: "Start caps", slot: "startCap" },
  { id: "endCaps", label: "End caps", slot: "endCap" },
  { id: "theme", label: "Themes" },
];

const GLYPH_SLOTS = {
  separator: { key: "separators", title: "Separators" },
  startCap: { key: "startCaps", title: "Start caps" },
  endCap: { key: "endCaps", title: "End caps" },
};

function configureCommand() {
  setConfigDir(resolveInstallDir());
  runTui();
}

let config;
let screen = "main";
let cursor = 0;
let previewData;
let exiting = false;
let flashMessage = "";
let searchQuery = "";
let glyphSlot = "separator";
// null while browsing the glyph list; a string while typing a code point.
let hexInput = null;

function openUrl(url) {
  const target = String(url || "").trim();
  if (!target) {
    return;
  }

  // Only http(s) URLs, passed as a single argument with no shell involved.
  if (!/^https?:\/\//i.test(target)) {
    return;
  }

  let file = "xdg-open";
  if (process.platform === "win32") {
    file = "explorer.exe";
  } else if (process.platform === "darwin") {
    file = "open";
  }

  try {
    const child = spawn(file, [target], { stdio: "ignore", detached: true, windowsHide: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // Graceful fallback
  }
}

function openRepo() {
  openUrl(REPO_URL);
  flashMessage = "⭐ Opened repo in browser";
}

function usedIds() {
  return new Set(
    config.widgets
      .filter((widget) => widget.id !== "separator" && widget.id !== "lineBreak")
      .map((widget) => widget.id)
  );
}

function addableWidgets() {
  const used = usedIds();

  return WIDGET_CATALOG.filter((widget) => !widget.unique || !used.has(widget.id));
}

function filteredAddableWidgets() {
  const items = addableWidgets();
  if (!searchQuery.trim()) {
    return items;
  }
  const q = searchQuery.toLowerCase().trim();
  return items.filter(
    (w) =>
      w.label.toLowerCase().includes(q) ||
      w.id.toLowerCase().includes(q) ||
      (w.description && w.description.toLowerCase().includes(q))
  );
}

function clampCursor(length) {
  if (length <= 0) {
    cursor = 0;
    return;
  }

  cursor = Math.max(0, Math.min(cursor, length - 1));
}

function wrapCursor(current, delta, length) {
  if (length <= 0) {
    return 0;
  }

  const clamped = Math.max(0, Math.min(current, length - 1));
  return (((clamped + delta) % length) + length) % length;
}

function moveCursor(delta, length) {
  cursor = wrapCursor(cursor, delta, length);
}

// The file can break while the TUI is open (edited by hand); keep the TUI
// running and say why changes stop being saved instead of crashing.
function persist() {
  try {
    saveConfig(config);
    return true;
  } catch (error) {
    if (!(error instanceof InvalidConfigError)) {
      throw error;
    }
    flashMessage = `⚠ Not saved: ${error.file} is no longer valid JSON. Fix it or delete it.`;
    return false;
  }
}

function moveItem(offset) {
  const next = cursor + offset;

  if (next < 0 || next >= config.widgets.length) {
    return;
  }

  const items = config.widgets;
  const current = items[cursor];
  items[cursor] = items[next];
  items[next] = current;
  cursor = next;
  persist();
}

function removeItem() {
  if (!config.widgets.length) {
    return;
  }

  config.widgets.splice(cursor, 1);
  clampCursor(config.widgets.length);
  persist();
}

function addItem(id) {
  let widget = { id };
  if (id === "customText") {
    widget = { id, text: "Custom" };
  } else if (id === "exec") {
    widget = { id, cmd: "git stash list | wc -l" };
    flashMessage = `⚠ Shell Command runs "${widget.cmd}" on every refresh. Edit "cmd" in ${getConfigPath()}`;
  }

  if (!config.widgets.length) {
    config.widgets.push(widget);
    cursor = 0;
  } else {
    config.widgets.splice(cursor + 1, 0, widget);
    cursor += 1;
  }

  persist();
}

function insertSeparator() {
  addItem("separator");
}

function insertLineBreak() {
  addItem("lineBreak");
}

const TABS = [
  { id: "main", label: "Widgets", key: "w" },
  { id: "presets", label: "Presets", key: "o" },
  { id: "themes", label: "Themes", key: "t" },
  { id: "layout", label: "Layout", key: "l" },
  { id: "powerline", label: "Powerline", key: "p" },
];

const TAB_OF_SCREEN = {
  main: "main",
  add: "main",
  presets: "presets",
  themes: "themes",
  customTheme: "themes",
  layout: "layout",
  powerline: "powerline",
  glyphs: "powerline",
};

const PRESET_ICONS = { default: "🎯", compact: "⚡", workspace: "📂", limits: "🔋", full: "🚀" };

// Set by renderFrame so tests can draw a screen at a fixed width.
let columnsOverride = null;
let ui;

function frameWidth() {
  const columns = columnsOverride || process.stdout.columns || 100;
  return Math.max(50, Math.min(columns - 1, 120));
}

function previewConfig() {
  if (screen === "themes") {
    const hovered = THEME_ORDER[cursor];
    return hovered ? { ...config, theme: hovered } : config;
  }

  if (screen === "customTheme") {
    return { ...config, theme: "custom" };
  }

  if (screen === "presets") {
    const hovered = PRESET_ORDER[cursor];
    return hovered ? applyPreset(config, hovered) : config;
  }

  if (screen === "layout") {
    const hovered = LAYOUT_ORDER[cursor];
    return hovered ? { ...config, layout: hovered } : config;
  }

  return config;
}

// Secondary text in the theme's readable gray (see tui-style.js).
function dim(text) {
  return ui.muted(text);
}

function previewPanel(width) {
  const preview = previewConfig();
  const { dot } = ui.glyph;
  previewData.terminal_width = width - 4;
  let rendered;

  try {
    rendered = renderStatusline(previewData, preview, { color: getActiveDepth() });
  } catch (error) {
    rendered = `Preview failed: ${error.message}`;
  }

  const layout = LAYOUTS[preview.layout]?.name ?? preview.layout;
  const style =
    preview.layout === "pills" ? ` ${dot} ${detectStyle(preview.powerline) ?? "custom"}` : "";
  const title = `Live preview ${dim(`${dot} ${layout} ${dot} ${preview.theme}${style}`)}`;
  // The toggle keys work on the widget list, so only that screen names them.
  const key = (letter) => (screen === "main" ? letter : "");
  const chips = [
    ui.chip("emojis", preview.emojis, key("e")),
    ui.chip("minimal", preview.minimalist, key("m")),
    ui.chip("pace", preview.pacing, key("r")),
    ui.chip("blink", Boolean(preview.thresholds?.blink), key("b")),
    ui.chip("ascii", preview.ascii, key("i")),
  ];
  if (preview.layout === "pills") {
    chips.unshift(
      ui.chip("joins", preview.powerline.enabled, key("j")),
      ui.chip("gaps", preview.rowGap, key("v"))
    );
  }

  return ui.panel(title, [...String(rendered).split("\n"), "", chips.join("   ")], width);
}

// Every screen: brand line, tabs, the screen's list panel, the live preview
// and the keys for this screen.
function screenFrame({ title, list, notes = [], keys }) {
  const width = frameWidth();
  const starText = `${ui.glyph.star} star`;
  const star = `\x1b]8;;${REPO_URL}\x07${dim(starText)}\x1b]8;;\x07`;
  const toast = flashMessage ? `   ${ui.toast(flashMessage)}` : "";
  const body = notes.length ? [...list, "", ...notes.map(dim)] : list;

  return [
    "",
    ` ${ui.wordmark("agy-powerline")} ${dim(`v${VERSION}`)}  ${star}${toast}`,
    ` ${dim(`${ui.glyph.sparkle} make agy feel like yours`)}`,
    "",
    ui.tabs(TABS, TAB_OF_SCREEN[screen]),
    "",
    ...ui.panel(title, body, width),
    ...previewPanel(width),
    ...ui.hints(keys, width - 1),
  ];
}

function widgetCount() {
  const count = config.widgets.filter((w) => w.id !== "separator" && w.id !== "lineBreak").length;
  return `${count} widget${count === 1 ? "" : "s"}`;
}

function drawMain() {
  const { upDown, shift } = ui.glyph;
  const list = config.widgets.length
    ? config.widgets.map((widget, index) => {
        const meta = WIDGET_CATALOG.find((item) => item.id === widget.id);
        let extra = meta?.description ?? "";
        if (widget.id === "exec" && widget.cmd) {
          extra = `cmd: ${widget.cmd}`;
        } else if (widget.text) {
          extra = `text: ${widget.text}`;
        } else if (widget.warn != null || widget.crit != null) {
          const parts = [];
          if (widget.warn != null) parts.push(`warn ${widget.warn}%`);
          if (widget.crit != null) parts.push(`crit ${widget.crit}%`);
          if (widget.blink) parts.push("blink");
          extra = parts.join(", ");
        }
        // Layout items read as quiet dividers, not as widgets.
        if (widget.id === "separator" || widget.id === "lineBreak") {
          const divider =
            widget.id === "separator"
              ? `${config.ascii ? "..." : "╌╌"} flex space`
              : `${config.ascii ? "--" : "↵"} new row`;
          return ui.row(index === cursor, dim(divider), "", index + 1);
        }
        return ui.row(index === cursor, widgetLabel(widget.id), extra, index + 1);
      })
    : [dim(`${ui.glyph.sparkle} nothing here yet. Press a to add your first widget.`)];

  return screenFrame({
    title: `Your widgets ${dim(`${ui.glyph.dot} ${widgetCount()}`)}`,
    list,
    keys: [
      [upDown, "move"],
      [`${shift}${upDown}`, "reorder"],
      ["a", "add"],
      ["s", "flex space"],
      ["n", "new row"],
      ["x", "remove"],
      ["d", "reset"],
      ["g", "star"],
      ["q", "save & quit"],
    ],
  });
}

function drawAdd() {
  const items = filteredAddableWidgets();
  const caret = config.ascii ? "_" : "▏";
  const search = searchQuery
    ? `${BOLD}${searchQuery}${RESET}${caret}`
    : `${caret}${dim("type to filter")}`;
  const list = [`${config.ascii ? "search:" : "🔎"} ${search}`, ""];

  if (!items.length) {
    list.push(dim(`No widget matches "${searchQuery}". Backspace to edit, Esc to go back.`));
  } else {
    items.forEach((widget, index) => {
      list.push(ui.row(index === cursor, widget.label, widget.description));
    });
  }

  return screenFrame({
    title: "Add a widget",
    list,
    keys: [
      ["type", "filter"],
      [ui.glyph.upDown, "move"],
      ["enter", "add"],
      ["backspace", "delete"],
      ["esc", "back"],
    ],
  });
}

function drawPresets() {
  const list = PRESET_ORDER.map((id, index) => {
    const preset = PRESETS[id];
    const icon = config.ascii ? "" : `${PRESET_ICONS[id] || "•"} `;
    return ui.row(index === cursor, `${icon}${preset.name}`, preset.description);
  });

  return screenFrame({
    title: "Presets",
    list,
    notes: ["A preset swaps your widgets; your layout and theme stay."],
    keys: [
      [ui.glyph.upDown, "preview"],
      ["enter", "apply"],
      ["esc", "back"],
    ],
  });
}

function themeSwatch(colors) {
  if (!colors || config.ascii) {
    return "";
  }
  return (
    ["model", "context", "fiveHour", "caution", "warn"]
      .map((slot) => `${fg(colors[slot])}●`)
      .join("") + RESET
  );
}

function drawThemes() {
  const list = THEME_ORDER.map((id, index) => {
    const theme =
      THEMES[id] || (id === "custom" ? { name: "Custom", description: "Your own colors" } : null);
    if (!theme) {
      return "";
    }
    const swatch = themeSwatch(id === "custom" ? null : theme.colors);
    const current = id === config.theme ? ` ${ui.chip("current", true)}` : "";
    const extra = id === "custom" ? `${theme.description}, Enter to edit` : theme.description;
    const name = swatch ? `${swatch} ${theme.name}` : theme.name;
    return ui.row(index === cursor, name + current, extra);
  });

  return screenFrame({
    title: "Themes",
    list,
    keys: [
      [ui.glyph.upDown, "preview"],
      ["enter", "apply"],
      ["esc", "back"],
    ],
  });
}

function hexSwatch(hex) {
  if (!hex || hex === "(base)") return "from base theme";
  try {
    return `${fg(parseColor(hex))}${config.ascii ? "#" : "■"}${RESET} ${hex}`;
  } catch {
    return hex;
  }
}

function drawCustomTheme() {
  const customColors = config.customTheme?.colors || {};
  const list = CUSTOM_COLOR_SLOTS.map((slot, index) =>
    ui.row(index === cursor, slot.label, hexSwatch(customColors[slot.key] || "(base)"))
  );

  return screenFrame({
    title: "Custom theme",
    list,
    notes: ["Cycle a slot through curated colors; the preview updates as you go."],
    keys: [
      [ui.glyph.upDown, "slot"],
      [ui.glyph.leftRight, "cycle color"],
      ["enter", "next color"],
      ["esc", "back"],
    ],
  });
}

function glyphLabel(hex, slot) {
  return `${glyphChar(hex, slot, config.ascii)}  ${glyphName(hex)} (U+${hex})`;
}

function glyphSummary(slot) {
  const list = config.powerline[GLYPH_SLOTS[slot].key];
  if (!list.length) {
    return "none";
  }

  return list.map((hex) => `${glyphChar(hex, slot, config.ascii)} ${glyphName(hex)}`).join(", ");
}

function powerlineRowValue(row) {
  if (row.id === "enabled") {
    return config.powerline.enabled ? "on" : "off";
  }

  if (row.id === "rowGap") {
    return config.rowGap ? "on" : "off";
  }

  if (row.id === "style") {
    const style = detectStyle(config.powerline);
    return style ? STYLES[style].name : "custom";
  }

  if (row.slot) {
    return glyphSummary(row.slot);
  }

  return THEMES[config.theme]?.name ?? config.theme;
}

function drawPowerline() {
  const list = POWERLINE_ROWS.map((row, index) =>
    ui.row(index === cursor, row.label, powerlineRowValue(row))
  );
  const notes =
    config.layout === "lines"
      ? ["Powerline shapes apply to Pills. Switch layout with l."]
      : [
          "A style sets caps and separators together; edit a list to fine-tune it.",
          "Lists with several glyphs cycle left to right. A Flex Separator starts a new pill.",
        ];

  return screenFrame({
    title: "Powerline",
    list,
    notes,
    keys: [
      [ui.glyph.upDown, "move"],
      ["enter", "toggle / cycle / edit"],
      ["esc", "back"],
    ],
  });
}

function drawGlyphs() {
  const { key, title } = GLYPH_SLOTS[glyphSlot];
  const list = config.powerline[key];
  const isSeparator = glyphSlot === "separator";

  if (hexInput !== null) {
    return screenFrame({
      title: `Powerline ${ui.glyph.dot} ${title}`,
      list: [
        `Code point: ${BOLD}U+${hexInput}${RESET}${dim("_".repeat(6 - hexInput.length))}`,
        "",
        dim("Type 4-6 hex digits, e.g. E0B0 (Powerline), E0C0 (flame), 2588 (block)."),
      ],
      keys: [
        ["enter", "apply"],
        ["esc", "cancel"],
      ],
    });
  }

  const rows = list.length
    ? list.map((hex, index) => {
        const inverted = isSeparator && config.powerline.separatorInvert[index] ? "inverted" : "";
        return ui.row(index === cursor, glyphLabel(hex, glyphSlot), inverted);
      })
    : [
        dim(
          `None: ${isSeparator ? "widgets in a pill touch directly" : "pills have no cap on this side"}. Press a to add one.`
        ),
      ];

  return screenFrame({
    title: `Powerline ${ui.glyph.dot} ${title}`,
    list: rows,
    notes: isSeparator
      ? ["Invert swaps the separator colors; left-pointing glyphs get it automatically."]
      : [],
    keys: [
      [ui.glyph.upDown, "select"],
      [ui.glyph.leftRight, "cycle preset"],
      ["a", "add"],
      ["i", "insert"],
      ["x", "remove"],
      ["c", "clear"],
      ["h", "hex"],
      ...(isSeparator ? [["v", "invert"]] : []),
      ["esc", "back"],
    ],
  });
}

function drawLayout() {
  const list = LAYOUT_ORDER.map((id, index) => {
    const layout = LAYOUTS[id];
    const current = id === config.layout ? ` ${ui.chip("current", true)}` : "";
    return ui.row(index === cursor, layout.name + current, layout.description);
  });

  return screenFrame({
    title: "Layout",
    list,
    notes: ["Both layouts use your widgets and theme; Powerline shapes apply to Pills."],
    keys: [
      [ui.glyph.upDown, "preview"],
      ["enter", "apply"],
      ["esc", "back"],
    ],
  });
}

function frameLines() {
  const shown = previewConfig();
  ui = makeUi(themeColors(shown.theme, shown.customTheme), {
    ascii: config.ascii === true,
    width: frameWidth(),
  });

  if (screen === "add") return drawAdd();
  if (screen === "themes") return drawThemes();
  if (screen === "customTheme") return drawCustomTheme();
  if (screen === "presets") return drawPresets();
  if (screen === "powerline") return drawPowerline();
  if (screen === "glyphs") return drawGlyphs();
  if (screen === "layout") return drawLayout();
  return drawMain();
}

function draw() {
  process.stdout.write(HOME_CLEAR + HIDE + frameLines().join("\n") + "\n");
}

// Draws one screen without a terminal, for tests. Options: config, screen,
// cursor, columns, color ("truecolor", "256", "none"), search, flash, and
// widgets (a list used as is, even empty, which a saved config never is).
function renderFrame(options = {}) {
  config = mergeConfig(options.config || {});
  if (options.widgets) {
    config.widgets = options.widgets;
  }
  screen = options.screen || "main";
  cursor = options.cursor || 0;
  searchQuery = options.search || "";
  flashMessage = options.flash || "";
  glyphSlot = options.glyphSlot || "separator";
  hexInput = options.hexInput ?? null;
  previewData = options.data || sampleData();
  columnsOverride = options.columns || 100;
  const previousDepth = getActiveDepth();
  setActiveDepth(options.color || "truecolor");
  try {
    return frameLines().join("\n");
  } finally {
    columnsOverride = null;
    setActiveDepth(previousDepth);
  }
}

function openAdd() {
  screen = "add";
  searchQuery = "";
  cursor = 0;
  clampCursor(filteredAddableWidgets().length);
}

function openPresets() {
  screen = "presets";
  cursor = 0;
}

function openCustomTheme() {
  screen = "customTheme";
  cursor = 0;
}

function openThemes() {
  screen = "themes";
  cursor = Math.max(0, THEME_ORDER.indexOf(config.theme));
}

function openPowerline() {
  screen = "powerline";
  cursor = 0;
}

function openGlyphs(slot) {
  screen = "glyphs";
  glyphSlot = slot;
  hexInput = null;
  cursor = 0;
}

function openLayout() {
  screen = "layout";
  cursor = Math.max(0, LAYOUT_ORDER.indexOf(config.layout));
}

function backToMain() {
  screen = "main";
  clampCursor(config.widgets.length);
}

const TAB_OPENERS = {
  main: () => {
    backToMain();
    cursor = 0;
  },
  presets: () => openPresets(),
  themes: () => openThemes(),
  layout: () => openLayout(),
  powerline: () => openPowerline(),
};

// ← → and Tab / Shift+Tab move between the tabs, and each tab's letter opens
// it. Sub-screens (adding a widget, the color and glyph editors) keep those
// keys for themselves. Returns the tab to open, or null when the key doesn't
// switch tabs.
function tabAfter(current, key) {
  if (!TABS.some((tab) => tab.id === current) || !key) {
    return null;
  }
  const byLetter = !key.ctrl && TABS.find((tab) => tab.key && tab.key === key.name);
  if (byLetter) {
    return byLetter.id === current ? null : byLetter.id;
  }
  const back = key.name === "left" || (key.name === "tab" && key.shift);
  if (!back && key.name !== "right" && key.name !== "tab") {
    return null;
  }
  const index = TABS.findIndex((tab) => tab.id === current);
  return TABS[(index + (back ? -1 : 1) + TABS.length) % TABS.length].id;
}

function switchTab(key) {
  const next = tabAfter(screen, key);
  if (!next) {
    return false;
  }
  TAB_OPENERS[next]();
  return true;
}

function onMain(key) {
  if (key.name === "up") {
    if (key.shift) {
      moveItem(-1);
    } else {
      moveCursor(-1, config.widgets.length);
    }
    return;
  }

  if (key.name === "down") {
    if (key.shift) {
      moveItem(1);
    } else {
      moveCursor(1, config.widgets.length);
    }
    return;
  }

  if (key.sequence === "[" || key.name === "[") {
    moveItem(-1);
    return;
  }

  if (key.sequence === "]" || key.name === "]") {
    moveItem(1);
    return;
  }

  if (key.name === "i") {
    config.ascii = !config.ascii;
    persist();
    return;
  }

  if (key.name === "a") {
    openAdd();
    return;
  }

  if (key.name === "s") {
    insertSeparator();
    return;
  }

  if (key.name === "n") {
    insertLineBreak();
    return;
  }

  if (key.name === "x" || key.name === "delete" || key.name === "backspace") {
    removeItem();
    return;
  }

  if (key.name === "d") {
    config = defaultConfig();
    if (persist()) {
      flashMessage = "Reset to default configuration.";
    }
    clampCursor(config.widgets.length);
    return;
  }

  if (key.name === "b") {
    config.thresholds = config.thresholds || {};
    config.thresholds.blink = !config.thresholds.blink;
    if (persist()) {
      flashMessage = `Alert blink: ${config.thresholds.blink ? "on" : "off"}`;
    }
    return;
  }

  if (key.name === "j") {
    setPowerline({ enabled: !config.powerline.enabled });
    return;
  }

  if (key.name === "v") {
    toggleRowGap();
    return;
  }

  if (key.name === "e") {
    config.emojis = !config.emojis;
    persist();
    return;
  }

  if (key.name === "m") {
    config.minimalist = !config.minimalist;
    if (persist()) {
      flashMessage = `Minimalist: ${config.minimalist ? "on (values only)" : "off"}`;
    }
    return;
  }

  if (key.name === "r") {
    config.pacing = !config.pacing;
    if (persist()) {
      flashMessage = `Pace marker: ${config.pacing ? "on" : "off"}`;
    }
  }
}

function onAdd(key) {
  const items = filteredAddableWidgets();

  if (key.name === "escape") {
    if (searchQuery.length > 0) {
      searchQuery = "";
      cursor = 0;
      clampCursor(filteredAddableWidgets().length);
      return;
    }
    backToMain();
    return;
  }

  if (key.name === "up") {
    moveCursor(-1, items.length);
    return;
  }

  if (key.name === "down") {
    moveCursor(1, items.length);
    return;
  }

  if (key.name === "return" && items[cursor]) {
    addItem(items[cursor].id);
    backToMain();
    return;
  }

  if (key.name === "backspace" || key.name === "delete") {
    if (searchQuery.length > 0) {
      searchQuery = searchQuery.slice(0, -1);
      cursor = 0;
      clampCursor(filteredAddableWidgets().length);
    }
    return;
  }

  if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
    const char = key.sequence;
    if (char >= " " && char <= "~") {
      searchQuery += char;
      cursor = 0;
      clampCursor(filteredAddableWidgets().length);
    }
  }
}

function cycleCustomColor(slotKey, dir = 1) {
  if (!config.customTheme) {
    config.customTheme = { colors: {} };
  }
  if (!config.customTheme.colors) {
    config.customTheme.colors = {};
  }
  const current = config.customTheme.colors[slotKey];
  const idx = CURATED_HEX_PALETTE.indexOf(current);
  let nextIdx;
  if (idx === -1) {
    nextIdx = dir >= 0 ? 0 : CURATED_HEX_PALETTE.length - 1;
  } else {
    nextIdx = (idx + dir + CURATED_HEX_PALETTE.length) % CURATED_HEX_PALETTE.length;
  }
  config.customTheme.colors[slotKey] = CURATED_HEX_PALETTE[nextIdx];
  config.theme = "custom";
  persist();
}

function onCustomTheme(key) {
  if (key.name === "escape") {
    backToMain();
    return;
  }

  if (key.name === "up") {
    moveCursor(-1, CUSTOM_COLOR_SLOTS.length);
    return;
  }

  if (key.name === "down") {
    moveCursor(1, CUSTOM_COLOR_SLOTS.length);
    return;
  }

  if (key.name === "left") {
    const slot = CUSTOM_COLOR_SLOTS[cursor];
    if (slot) {
      cycleCustomColor(slot.key, -1);
    }
    return;
  }

  if (key.name === "right" || key.name === "return" || key.name === "space") {
    const slot = CUSTOM_COLOR_SLOTS[cursor];
    if (slot) {
      cycleCustomColor(slot.key, 1);
    }
  }
}

function onPresets(key) {
  if (key.name === "escape") {
    backToMain();
    return;
  }

  if (key.name === "up") {
    moveCursor(-1, PRESET_ORDER.length);
    return;
  }

  if (key.name === "down") {
    moveCursor(1, PRESET_ORDER.length);
    return;
  }

  if (key.name === "return") {
    const presetId = PRESET_ORDER[cursor];
    if (presetId && PRESETS[presetId]) {
      config = applyPreset(config, presetId);
      if (persist()) {
        flashMessage = `Applied preset: ${PRESETS[presetId].name}`;
      }
    }
    backToMain();
  }
}

function onThemes(key) {
  if (key.name === "escape") {
    backToMain();
    return;
  }

  if (key.name === "up") {
    moveCursor(-1, THEME_ORDER.length);
    return;
  }

  if (key.name === "down") {
    moveCursor(1, THEME_ORDER.length);
    return;
  }

  if (key.name === "c" || key.name === "e") {
    openCustomTheme();
    return;
  }

  if (key.name === "return") {
    const selected = THEME_ORDER[cursor];
    if (selected === "custom") {
      openCustomTheme();
      return;
    }
    config.theme = selected;
    persist();
    backToMain();
  }
}

function onLayout(key) {
  if (key.name === "escape") {
    backToMain();
    return;
  }

  if (key.name === "up") {
    moveCursor(-1, LAYOUT_ORDER.length);
    return;
  }

  if (key.name === "down") {
    moveCursor(1, LAYOUT_ORDER.length);
    return;
  }

  if (key.name === "return") {
    config.layout = LAYOUT_ORDER[cursor];
    persist();
    backToMain();
  }
}

function toggleRowGap() {
  config.rowGap = !config.rowGap;
  if (persist()) {
    flashMessage = `Space between rows: ${config.rowGap ? "on" : "off"}`;
  }
}

function setPowerline(changes) {
  config.powerline = normalizePowerline({ ...config.powerline, ...changes });
  persist();
}

function onPowerline(key) {
  if (key.name === "escape") {
    backToMain();
    return;
  }

  if (key.name === "up") {
    moveCursor(-1, POWERLINE_ROWS.length);
    return;
  }

  if (key.name === "down") {
    moveCursor(1, POWERLINE_ROWS.length);
    return;
  }

  if (key.name !== "return") {
    return;
  }

  const row = POWERLINE_ROWS[cursor];

  if (row.id === "enabled") {
    setPowerline({ enabled: !config.powerline.enabled });
  } else if (row.id === "rowGap") {
    toggleRowGap();
  } else if (row.id === "style") {
    // A customized setup restarts the cycle at the first style.
    const current = STYLE_ORDER.indexOf(detectStyle(config.powerline));
    const next = STYLE_ORDER[(current + 1) % STYLE_ORDER.length];
    config.powerline = applyStyle(config.powerline, next);
    persist();
  } else if (row.slot) {
    openGlyphs(row.slot);
  } else {
    openThemes();
  }
}

// Writes a new glyph list for the open slot. Separators carry their invert
// flags along so a flag stays with its glyph when the list is edited.
function setGlyphs(list, invert) {
  const changes = { [GLYPH_SLOTS[glyphSlot].key]: list };
  if (glyphSlot === "separator") {
    changes.separatorInvert = invert;
  }
  setPowerline(changes);
  clampCursor(list.length);
}

function onGlyphHex(key) {
  if (key.name === "escape") {
    hexInput = null;
    return;
  }

  if (key.name === "backspace" || key.name === "delete") {
    hexInput = hexInput.slice(0, -1);
    return;
  }

  if (key.name === "return") {
    const hex = hexInput.length >= 4 ? parseGlyph(hexInput) : null;
    if (!hex) {
      flashMessage = `⚠ U+${hexInput || "?"} is not a printable glyph`;
      return;
    }

    const list = [...config.powerline[GLYPH_SLOTS[glyphSlot].key]];
    const invert = [...config.powerline.separatorInvert];
    const index = list.length ? cursor : 0;
    list[index] = hex;
    invert[index] = INVERTED_BY_DEFAULT.has(hex);
    hexInput = null;
    setGlyphs(list, invert);
    return;
  }

  const char = key.sequence;
  if (char && /^[0-9a-f]$/i.test(char) && hexInput.length < 6) {
    hexInput += char.toUpperCase();
  }
}

function onGlyphs(key) {
  if (hexInput !== null) {
    onGlyphHex(key);
    return;
  }

  const presets = SLOT_PRESETS[glyphSlot];
  const list = [...config.powerline[GLYPH_SLOTS[glyphSlot].key]];
  const invert = [...config.powerline.separatorInvert];

  if (key.name === "escape") {
    screen = "powerline";
    cursor = POWERLINE_ROWS.findIndex((row) => row.slot === glyphSlot);
    return;
  }

  if (key.name === "up") {
    moveCursor(-1, list.length);
    return;
  }

  if (key.name === "down") {
    moveCursor(1, list.length);
    return;
  }

  if ((key.name === "left" || key.name === "right") && list.length) {
    // Custom glyphs jump to the first (or last) preset.
    const current = presets.indexOf(list[cursor]);
    const step = key.name === "right" ? 1 : -1;
    let next;
    if (current === -1) {
      next = step === 1 ? 0 : presets.length - 1;
    } else {
      next = (current + step + presets.length) % presets.length;
    }
    list[cursor] = presets[next];
    invert[cursor] = INVERTED_BY_DEFAULT.has(presets[next]);
    setGlyphs(list, invert);
    return;
  }

  if (key.name === "a" || key.name === "i") {
    if (list.length >= MAX_GLYPHS) {
      flashMessage = `⚠ At most ${MAX_GLYPHS} glyphs per list`;
      return;
    }
    const at = list.length && key.name === "a" ? cursor + 1 : Math.min(cursor, list.length);
    list.splice(at, 0, presets[0]);
    invert.splice(at, 0, INVERTED_BY_DEFAULT.has(presets[0]));
    cursor = at;
    setGlyphs(list, invert);
    return;
  }

  if ((key.name === "x" || key.name === "delete") && list.length) {
    list.splice(cursor, 1);
    invert.splice(cursor, 1);
    setGlyphs(list, invert);
    return;
  }

  if (key.name === "c") {
    cursor = 0;
    setGlyphs([], []);
    return;
  }

  if (key.name === "h") {
    hexInput = "";
    return;
  }

  if (key.name === "v" && glyphSlot === "separator" && list.length) {
    invert[cursor] = !invert[cursor];
    setGlyphs(list, invert);
  }
}

// While a text field is open (widget search, glyph code), "q" is a letter
// ("quota"), not quit. Ctrl+C always quits.
function isQuitKey(key, typing) {
  return Boolean((key.ctrl && key.name === "c") || (key.name === "q" && !typing));
}

function onKey(_str, key) {
  if (!key || exiting) {
    return;
  }

  if (isQuitKey(key, screen === "add" || hexInput !== null)) {
    quit();
    return;
  }

  if (key.ctrl && key.name === "g") {
    openRepo();
    draw();
    return;
  }

  if (screen !== "add" && key.name === "g") {
    openRepo();
    draw();
    return;
  }

  flashMessage = "";

  if (switchTab(key)) {
    draw();
    return;
  }

  if (screen === "add") {
    onAdd(key);
  } else if (screen === "themes") {
    onThemes(key);
  } else if (screen === "customTheme") {
    onCustomTheme(key);
  } else if (screen === "presets") {
    onPresets(key);
  } else if (screen === "powerline") {
    onPowerline(key);
  } else if (screen === "glyphs") {
    onGlyphs(key);
  } else if (screen === "layout") {
    onLayout(key);
  } else {
    onMain(key);
  }

  draw();
}

function quit() {
  if (exiting) {
    return;
  }

  exiting = true;
  persist();
  process.stdin.setRawMode?.(false);
  process.stdout.write(SHOW + ALT_OFF);
  process.exit(0);
}

function start() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("Run this in an interactive terminal:");
    console.error("  npx agy-powerline configure");
    process.exit(1);
  }

  config = loadEditableConfig();
  if (!config) {
    process.exit(1);
  }
  previewData = sampleData();
  setActiveDepth(resolveColorDepth({ configColor: config.color, env: process.env }));
  screen = "main";
  cursor = 0;
  exiting = false;

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("keypress", onKey);
  process.on("SIGINT", quit);
  process.on("SIGTERM", quit);
  process.stdout.write(ALT_ON + HIDE);
  draw();
}

function runTui() {
  start();
}

module.exports = {
  configureCommand,
  renderFrame,
  tabAfter,
  isQuitKey,
  wrapCursor,
  openUrl,
  REPO_URL,
};

if (require.main === module) {
  configureCommand();
}
