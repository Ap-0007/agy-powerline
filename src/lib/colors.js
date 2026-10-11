"use strict";

const CSI = "\x1b[";
const RESET = `${CSI}0m`;
const BOLD = `${CSI}1m`;
const DIM = `${CSI}2m`;
// Normal intensity: ends bold (and dim) without resetting colors.
const NORMAL = `${CSI}22m`;
const BLINK = `${CSI}5m`;
const BLINK_OFF = `${CSI}25m`;

let activeDepth = "truecolor";

function setActiveDepth(depth) {
  activeDepth = depth;
}

function getActiveDepth() {
  return activeDepth;
}

const COLOR_MODES = ["auto", "truecolor", "256", "none"];

function resolveColorModeId(mode) {
  return COLOR_MODES.includes(mode) ? mode : "auto";
}

function isTruthyFlag(value) {
  return /^(1|true|yes)$/i.test(String(value ?? "").trim());
}

function detectColorDepth(env = {}) {
  if (env?.NO_COLOR !== undefined && String(env.NO_COLOR) !== "") {
    return "none";
  }

  const colorterm = String(env?.COLORTERM ?? "").trim();

  if (/^(truecolor|24bit)$/i.test(colorterm)) {
    return "truecolor";
  }

  if (/256colou?r/i.test(`${env?.TERM ?? ""} ${colorterm}`)) {
    return "256";
  }

  if (String(env?.TERM ?? "").trim() === "dumb") {
    return "none";
  }

  return "truecolor";
}

function resolveColorDepth({ configColor = "auto", cliColor = "", env = {} } = {}) {
  const cli = String(cliColor || "").toLowerCase();

  if (cli === "truecolor" || cli === "256" || cli === "none") {
    return cli;
  }

  if (env?.NO_COLOR !== undefined && String(env.NO_COLOR) !== "") {
    return "none";
  }

  const fromEnv = String(env?.AGY_POWERLINE_COLOR || "").toLowerCase();

  if (fromEnv === "truecolor" || fromEnv === "256" || fromEnv === "none") {
    return fromEnv;
  }

  if (configColor === "truecolor" || configColor === "256" || configColor === "none") {
    return configColor;
  }

  return detectColorDepth(env);
}

function resolveAscii(config, overrides = {}, env = {}) {
  if (overrides.ascii === true) {
    return true;
  }

  if (overrides.ascii === false) {
    return false;
  }

  return Boolean(config?.ascii) || isTruthyFlag(env?.AGY_POWERLINE_ASCII);
}

function rgb(r, g, b) {
  return [r, g, b];
}

function rgbToAnsi256([r, g, b]) {
  if (r === g && g === b) {
    if (r < 8) {
      return 16;
    }

    if (r > 248) {
      return 231;
    }

    return Math.round(((r - 8) / 247) * 24) + 232;
  }

  const to6 = (v) => Math.round((v / 255) * 5);
  return 16 + 36 * to6(r) + 6 * to6(g) + to6(b);
}

function colorSeq(kind, [r, g, b]) {
  if (activeDepth === "none") {
    return "";
  }

  if (activeDepth === "256") {
    return `${CSI}${kind};5;${rgbToAnsi256([r, g, b])}m`;
  }

  return `${CSI}${kind};2;${r};${g};${b}m`;
}

function fg(rgb) {
  return colorSeq(38, rgb);
}

function bg(rgb) {
  return colorSeq(48, rgb);
}

// Back to the terminal's own background, whatever it is (dark or light).
function bgDefault() {
  return activeDepth === "none" ? "" : CSI + "49m";
}

function shade(color, amount) {
  return color.map((n) => Math.round(n * amount));
}

// t of the way from color a to color b.
function mix(a, b, t) {
  return a.map((value, i) => Math.round(value + (b[i] - value) * t));
}

function parseColor(value, fallback = [200, 200, 200]) {
  if (value == null) {
    return fallback;
  }

  if (Array.isArray(value)) {
    if (value.length >= 3) {
      const r = Math.max(0, Math.min(255, Number(value[0])));
      const g = Math.max(0, Math.min(255, Number(value[1])));
      const b = Math.max(0, Math.min(255, Number(value[2])));
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        return [Math.round(r), Math.round(g), Math.round(b)];
      }
    }
    return fallback;
  }

  if (typeof value === "object") {
    if ("r" in value && "g" in value && "b" in value) {
      const r = Math.max(0, Math.min(255, Number(value.r)));
      const g = Math.max(0, Math.min(255, Number(value.g)));
      const b = Math.max(0, Math.min(255, Number(value.b)));
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        return [Math.round(r), Math.round(g), Math.round(b)];
      }
    }
    return fallback;
  }

  if (typeof value === "string") {
    const s = value.trim();

    const hexMatch = s.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (hexMatch) {
      let hex = hexMatch[1];
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      const num = parseInt(hex, 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    }

    const rgbMatch = s.match(/^(?:rgb\s*\(\s*)?(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)?$/i);
    if (rgbMatch) {
      const r = Math.max(0, Math.min(255, parseInt(rgbMatch[1], 10)));
      const g = Math.max(0, Math.min(255, parseInt(rgbMatch[2], 10)));
      const b = Math.max(0, Math.min(255, parseInt(rgbMatch[3], 10)));
      return [r, g, b];
    }
  }

  return fallback;
}

module.exports = {
  CSI,
  RESET,
  BOLD,
  DIM,
  NORMAL,
  BLINK,
  BLINK_OFF,
  setActiveDepth,
  getActiveDepth,
  COLOR_MODES,
  resolveColorModeId,
  isTruthyFlag,
  detectColorDepth,
  resolveColorDepth,
  resolveAscii,
  rgb,
  rgbToAnsi256,
  colorSeq,
  fg,
  bg,
  bgDefault,
  shade,
  mix,
  parseColor,
};
