"use strict";

const { record } = require("../helpers");
const { renderFrame, tabAfter } = require("../../src/cli/configure");
const { defaultConfig, renderStatusline, sampleData } = require("../../src/lib/shared");
const { visibleWidth } = require("../../src/lib/formatters");

const SCREENS = [
  "main",
  "add",
  "presets",
  "themes",
  "customTheme",
  "layout",
  "powerline",
  "glyphs",
];

const strip = (text) => text.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b\]8;;[^\x07]*\x07/g, "");
const widest = (text) => Math.max(...strip(text).split("\n").map(visibleWidth));

async function run() {
  testEveryScreenFits();
  testAsciiAndNoColor();
  testScreenContent();
  testDepthIsRestored();
  testTabKeys();
}

// The configurator redraws the whole screen: a line wider than the terminal
// would wrap and push everything down.
function testEveryScreenFits() {
  const overflows = [];

  for (const screen of SCREENS) {
    for (const columns of [60, 80, 100, 160]) {
      for (const ascii of [false, true]) {
        const out = renderFrame({ config: { ...defaultConfig(), ascii }, screen, columns });
        if (widest(out) > columns - 1) {
          overflows.push(`${screen}@${columns}${ascii ? "/ascii" : ""}: ${widest(out)}`);
        }
      }
    }
  }

  record(
    "every configurator screen fits 60 to 160 columns",
    !overflows.length,
    overflows.join(", ")
  );
}

function testAsciiAndNoColor() {
  const nonAscii = [];
  const colored = [];

  for (const screen of SCREENS) {
    const config = { ...defaultConfig(), ascii: true };
    const out = strip(renderFrame({ config, screen, columns: 60, color: "none" }));
    const found = out.match(/[^\x00-\x7f]/g);
    if (found) {
      nonAscii.push(`${screen}: ${[...new Set(found)].join("")}`);
    }

    const plain = renderFrame({ config: defaultConfig(), screen, color: "none" });
    if (/\x1b\[[34]8;/.test(plain)) {
      colored.push(screen);
    }
  }

  record("ASCII mode draws every screen in plain ASCII", !nonAscii.length, nonAscii.join("; "));
  record(
    "no-color mode draws every screen without color codes",
    !colored.length,
    colored.join(", ")
  );
}

function testScreenContent() {
  const main = strip(renderFrame({ config: defaultConfig() }));
  record(
    "main screen shows the brand, tabs, widgets, live preview and keys",
    /agy-powerline v\d/.test(main) &&
      /Widgets.*Presets.*Themes.*Layout.*Powerline/.test(main) &&
      /Your widgets · 7 widgets/.test(main) &&
      /flex space/.test(main) &&
      /Live preview/.test(main) &&
      /save & quit/.test(main) &&
      /joins j .* gaps v .* emojis e .* minimal m .* pace r .* blink b .* ascii i/.test(main)
  );

  const themes = strip(renderFrame({ config: defaultConfig(), screen: "themes" }));
  record(
    "toggle chips name their keys only on the widget list, where the keys work",
    /● emojis/.test(themes) && !/emojis e/.test(themes)
  );

  const search = strip(renderFrame({ config: defaultConfig(), screen: "add", search: "quo" }));
  record(
    "add screen filters widgets by the search text",
    /Tightest Quota/.test(search) && !/Context Bar/.test(search)
  );

  const presets = strip(renderFrame({ config: defaultConfig(), screen: "presets", cursor: 1 }));
  record(
    "presets screen previews the hovered preset",
    /One line/.test(presets) && /Quota: 7d/.test(presets)
  );

  const ok = strip(renderFrame({ config: defaultConfig(), flash: "Saved" }));
  const warn = strip(renderFrame({ config: defaultConfig(), flash: "⚠ At most 8 glyphs" }));
  record(
    "messages show as a success or a warning toast",
    /✓ Saved/.test(ok) && /⚠ At most 8 glyphs/.test(warn) && !/⚠ ⚠/.test(warn)
  );

  const empty = strip(renderFrame({ config: defaultConfig(), widgets: [] }));
  record("an empty widget list invites adding one", /Press a to add your first widget/.test(empty));
}

// Drawing a frame must not change how the bar renders afterwards.
function testDepthIsRestored() {
  const before = renderStatusline(sampleData(), defaultConfig());
  renderFrame({ config: defaultConfig(), color: "none" });
  const after = renderStatusline(sampleData(), defaultConfig());
  record("drawing a configurator frame leaves the bar's colors unchanged", before === after);
}

function testTabKeys() {
  const right = { name: "right" };
  const left = { name: "left" };
  record(
    "right arrow and Tab move to the next tab, wrapping around",
    tabAfter("main", right) === "presets" &&
      tabAfter("presets", { name: "tab" }) === "themes" &&
      tabAfter("powerline", right) === "main"
  );
  record(
    "left arrow and Shift+Tab move to the previous tab, wrapping around",
    tabAfter("themes", left) === "presets" &&
      tabAfter("layout", { name: "tab", shift: true }) === "themes" &&
      tabAfter("main", left) === "powerline"
  );
  record(
    "a tab's letter opens it from any tab, and does nothing on its own tab",
    tabAfter("main", { name: "t" }) === "themes" &&
      tabAfter("presets", { name: "w" }) === "main" &&
      tabAfter("powerline", { name: "o" }) === "presets" &&
      tabAfter("main", { name: "w" }) === null &&
      tabAfter("main", { name: "p", ctrl: true }) === null
  );
  record(
    "sub-screens keep their letters for typing",
    tabAfter("add", { name: "t" }) === null && tabAfter("glyphs", { name: "o" }) === null
  );
  record(
    "sub-screens keep the arrows, and other keys never switch tabs",
    tabAfter("add", right) === null &&
      tabAfter("customTheme", left) === null &&
      tabAfter("glyphs", right) === null &&
      tabAfter("main", { name: "up" }) === null
  );
}

module.exports = { run };
