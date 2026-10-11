"use strict";

// Building blocks for the configure TUI: wordmark, tabs, panels, keycaps and
// chips. Colors come from the active theme, so the editor matches the bar.
const { fg, bg, mix, RESET, BOLD, DIM, getActiveDepth } = require("../lib/colors");
const { visibleWidth } = require("../lib/formatters");
const { truncateLines } = require("../lib/fit");

const BOX = {
  round: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" },
  ascii: { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" },
};

const GLYPHS = {
  fancy: {
    pointer: "▌",
    on: "●",
    off: "○",
    ok: "✓",
    star: "⭐",
    sparkle: "✨",
    dot: "·",
    up: "↑",
    down: "↓",
    upDown: "↑↓",
    leftRight: "←→",
    shift: "⇧",
  },
  ascii: {
    pointer: ">",
    on: "*",
    off: "-",
    ok: "ok",
    star: "*",
    sparkle: "*",
    dot: "-",
    up: "up",
    down: "down",
    upDown: "up/down",
    leftRight: "left/right",
    shift: "shift+",
  },
};

const REVERSE = "\x1b[7m";
const strip = (text) =>
  String(text)
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\x1b\]8;;[^\x07]*\x07/g, "");

// width: the outer width of the panels, so a selected row can fill its panel.
function makeUi(colors, { ascii = false, width = 100 } = {}) {
  const plain = getActiveDepth() === "none";
  const box = ascii ? BOX.ascii : BOX.round;
  const glyph = ascii ? GLYPHS.ascii : GLYPHS.fancy;
  // Blue to green from the theme: calm on dark and light terminals alike.
  const accent = colors.context;
  const accent2 = colors.fiveHour;
  // Secondary text in the theme's readable gray, not the terminal's "dim",
  // which many dark terminals draw almost invisible.
  const mutedColor = colors.meta;
  const borderColor = mix(colors.track, colors.meta, 0.4);
  const inner = Math.max(10, width - 4);

  function muted(text) {
    return plain ? `${DIM}${text}${RESET}` : `${fg(mutedColor)}${text}${RESET}`;
  }

  function wordmark(text) {
    if (plain) {
      return BOLD + text + RESET;
    }
    const chars = Array.from(text);
    const last = Math.max(1, chars.length - 1);
    return (
      BOLD + chars.map((char, i) => fg(mix(accent, accent2, i / last)) + char).join("") + RESET
    );
  }

  function keycap(key) {
    return plain ? `[${key}]` : `${bg(colors.track)}${fg(mutedColor)}${BOLD} ${key} ${RESET}`;
  }

  // Key hints as keycaps, wrapped to the width without splitting a hint.
  function hints(items, lineWidth) {
    const lines = [];
    let line = "";
    for (const [key, label] of items) {
      const hint = `${keycap(key)} ${muted(label)}`;
      const next = line ? `${line}  ${hint}` : hint;
      if (line && visibleWidth(next) > lineWidth) {
        lines.push(line);
        line = hint;
      } else {
        line = next;
      }
    }
    if (line) {
      lines.push(line);
    }
    return lines.map((text) => ` ${text}`);
  }

  // Tabs for the main screens; the current one is a filled pill. On a narrow
  // terminal the key letters and the arrow hint go first.
  function tabs(items, current) {
    const draw = (withKeys) =>
      " " +
      items
        .map(({ id, label, key }) => {
          if (id === current) {
            return plain
              ? `${REVERSE}${BOLD} ${label} ${RESET}`
              : `${bg(accent)}${fg(colors.text)}${BOLD} ${label} ${RESET}`;
          }
          return ` ${BOLD}${label}${RESET}${withKeys && key ? ` ${muted(key)}` : ""} `;
        })
        .join(" ") +
      (withKeys && !ascii ? `   ${muted("← →")}` : "");
    const full = draw(true);
    return visibleWidth(full) <= width - 1 ? full : draw(false);
  }

  // An on/off toggle; key, when given, follows the label like a tab's letter.
  function chip(label, on, key = "") {
    const mark = on ? glyph.on : glyph.off;
    const hint = key ? ` ${muted(key)}` : "";
    return (on ? `${fg(accent2)}${mark}${RESET} ${label}` : muted(`${mark} ${label}`)) + hint;
  }

  // A rounded panel with its title in the top border. Content wider than the
  // panel is cut with an ellipsis instead of wrapping.
  function panel(title, body, panelWidth = width) {
    const space = Math.max(10, panelWidth - 4);
    const border = (text) => (plain ? text : fg(borderColor) + text + RESET);
    const label = title ? ` ${title} ` : "";
    const top =
      border(box.tl + box.h) +
      BOLD +
      label +
      RESET +
      border(box.h.repeat(Math.max(0, panelWidth - 3 - visibleWidth(label))) + box.tr);
    const rows = body.map((line) => {
      const clipped = truncateLines(line, space, ascii);
      const pad = " ".repeat(Math.max(0, space - visibleWidth(clipped)));
      return border(box.v) + " " + clipped + RESET + pad + " " + border(box.v);
    });
    const bottom = border(box.bl + box.h.repeat(Math.max(0, panelWidth - 2)) + box.br);
    return [top, ...rows, bottom];
  }

  // One list row. The selected row is a full-width bar in the accent color
  // (reverse video without color), so it stands out on any background.
  function row(selected, text, extra = "", number = null) {
    const index = number === null ? "" : `${String(number).padStart(2)} `;
    if (selected) {
      const content = strip(`${glyph.pointer} ${index}${text}${extra ? `   ${extra}` : ""}`);
      const clipped = truncateLines(content, inner, ascii);
      const padded = clipped + " ".repeat(Math.max(0, inner - visibleWidth(clipped)));
      return plain
        ? `${REVERSE}${BOLD}${padded}${RESET}`
        : `${bg(accent)}${fg(colors.text)}${BOLD}${padded}${RESET}`;
    }
    const note = extra ? `   ${muted(extra)}` : "";
    return `  ${index ? muted(index) : ""}${text}${note}`;
  }

  // Messages starting with ⚠ are warnings; everything else is a success.
  function toast(message) {
    if (!message) {
      return "";
    }
    const warning = message.startsWith("⚠");
    const text = message.replace(/^⚠\s*/, "");
    const color = warning ? colors.caution : accent2;
    const mark = warning ? (ascii ? "!" : "⚠") : glyph.ok;
    return plain ? `${BOLD}${mark} ${text}${RESET}` : `${fg(color)}${BOLD}${mark} ${text}${RESET}`;
  }

  return { glyph, muted, wordmark, keycap, hints, tabs, chip, panel, row, toast, accent };
}

module.exports = { makeUi };
