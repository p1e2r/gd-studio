// Loads sprites, sheets and fonts from the user's own Geometry Dash "Resources" folder.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config } from "./config.js";
import { parsePlist, parseBraces } from "./plist.js";

const QUALITY = [["-uhd", 4], ["-hd", 2], ["", 1]];

// Files the app needs to look like the game. Missing ones trigger the setup reminder.
export const REQUIRED = ["GJ_GameSheet.plist", "GJ_GameSheet02.plist", "GJ_GameSheet03.plist", "bigFont.fnt", "goldFont.fnt", "chatFont.fnt"];
export const RECOMMENDED = ["GJ_GameSheet04.plist", "GJ_GameSheetEditor.plist", "GJ_GameSheetGlow.plist", "GJ_GameSheetIcons.plist",
  "GJ_square01.png", "GJ_button_01.png", "game_bg_01_001.png", "groundSquare_01_001.png", "icons/player_01.plist"];

export const ICON_FORMS = {
  cube: "player", ship: "ship", ball: "player_ball", ufo: "bird", wave: "dart",
  robot: "robot", spider: "spider", swing: "swing", jetpack: "jetpack",
};

const state = {
  dir: null,
  files: new Map(), // logical name (no quality suffix, lowercase) -> [{path, scale}]
  frames: new Map(), // frame name -> {sheet, x,y,w,h, rotated, ox, oy, sw, sh, scale}
  sheets: new Map(), // sheet logical name -> {png, scale, frames: [names]}
  fonts: new Map(),
  iconCounts: {},
  anim: {},
  loadedAt: 0,
  error: null,
};

export const uploadedResourcesDir = () => path.join(config.dataDir, "resources");

function pickDir() {
  for (const d of [config.resourcesDir, uploadedResourcesDir()]) {
    try {
      if (fs.statSync(d).isDirectory() && fs.readdirSync(d).length) {
        // Accept a folder that *contains* Resources too.
        const nested = path.join(d, "Resources");
        if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) return nested;
        return d;
      }
    } catch { /* missing */ }
  }
  return null;
}

function logical(rel) {
  // "icons/player_01-uhd.plist" -> {key:"icons/player_01.plist", scale:4}
  const ext = path.extname(rel);
  let base = rel.slice(0, -ext.length);
  let scale = 1;
  for (const [suf, s] of QUALITY) {
    if (suf && base.toLowerCase().endsWith(suf)) { base = base.slice(0, -suf.length); scale = s; break; }
  }
  return { key: (base + ext).replace(/\\/g, "/").toLowerCase(), scale };
}

function walk(dir, rel = "", out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "__MACOSX" || e.name.startsWith("._") || e.name === ".DS_Store") continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (rel.split("/").length < 3) walk(path.join(dir, e.name), r, out);
    } else out.push(r);
  }
  return out;
}

export function findFile(name) {
  const list = state.files.get(name.toLowerCase().replace(/\\/g, "/"));
  if (!list || !list.length) return null;
  return list.reduce((a, b) => (b.scale > a.scale ? b : a));
}

function loadSheet(plistKey) {
  const f = findFile(plistKey);
  if (!f) return;
  const pngKey = plistKey.replace(/\.plist$/, ".png");
  // use the png at the same quality as the plist
  const png = (state.files.get(pngKey) || []).find((x) => x.scale === f.scale);
  if (!png) return;
  let data;
  try { data = parsePlist(fs.readFileSync(f.path, "utf8")); } catch { return; }
  if (!data || !data.frames) return;
  const names = [];
  for (const [name, fr] of Object.entries(data.frames)) {
    const rect = parseBraces(fr.textureRect ?? fr.frame);
    const off = parseBraces(fr.spriteOffset ?? fr.offset ?? "{0,0}");
    const src = parseBraces(fr.spriteSourceSize ?? fr.sourceSize ?? "{0,0}");
    const rotated = !!(fr.textureRotated ?? fr.rotated);
    if (rect.length < 4) continue;
    state.frames.set(name, {
      sheet: plistKey, x: rect[0], y: rect[1], w: rect[2], h: rect[3], rotated,
      ox: off[0] || 0, oy: off[1] || 0, sw: src[0] || rect[2], sh: src[1] || rect[3], scale: f.scale,
    });
    names.push(name);
  }
  state.sheets.set(plistKey, { png: png.path, scale: f.scale, frames: names });
}

function parseFnt(text) {
  const font = { chars: {}, kernings: {}, lineHeight: 0, base: 0, pages: [] };
  for (const line of text.split(/\r?\n/)) {
    const [tag, ...rest] = line.trim().split(/\s+/);
    const attrs = {};
    for (const m of line.matchAll(/(\w+)=("[^"]*"|\S+)/g)) attrs[m[1]] = m[2].replace(/^"|"$/g, "");
    if (tag === "common") { font.lineHeight = +attrs.lineHeight; font.base = +attrs.base; font.scaleW = +attrs.scaleW; font.scaleH = +attrs.scaleH; }
    else if (tag === "page") font.pages[+attrs.id] = attrs.file;
    else if (tag === "char") font.chars[attrs.id] = [+attrs.x, +attrs.y, +attrs.width, +attrs.height, +attrs.xoffset, +attrs.yoffset, +attrs.xadvance, +attrs.page || 0];
    else if (tag === "kerning") font.kernings[`${attrs.first},${attrs.second}`] = +attrs.amount;
    void rest;
  }
  return font;
}

export function load() {
  state.files.clear(); state.frames.clear(); state.sheets.clear(); state.fonts.clear();
  state.iconCounts = {}; state.anim = {}; state.error = null;
  state.dir = pickDir();
  state.loadedAt = Date.now();
  if (!state.dir) return status();
  try {
    for (const rel of walk(state.dir)) {
      const { key, scale } = logical(rel);
      if (!state.files.has(key)) state.files.set(key, []);
      state.files.get(key).push({ path: path.join(state.dir, rel), scale });
    }
    // sprite sheets: every plist with a sibling png that contains frames
    for (const key of state.files.keys()) {
      if (key.endsWith(".plist") && !/animdesc/i.test(key)) loadSheet(key);
    }
    // icon counts
    for (const [form, prefix] of Object.entries(ICON_FORMS)) {
      let max = 0;
      const re = new RegExp(`^icons/${prefix}_(\\d+)\\.plist$`);
      for (const key of state.files.keys()) {
        const m = key.match(re);
        if (m) max = Math.max(max, +m[1]);
      }
      state.iconCounts[form] = max;
    }
    // robot / spider idle poses
    for (const who of ["Robot", "Spider"]) {
      const f = findFile(`${who}_AnimDesc2.plist`) || findFile(`${who}_AnimDesc.plist`);
      if (f) { try { state.anim[who.toLowerCase()] = parsePlist(fs.readFileSync(f.path, "utf8")); } catch { /* ignore */ } }
    }
  } catch (e) {
    state.error = e.message;
  }
  return status();
}

export function status() {
  const has = (n) => !!(findFile(n));
  const missing = REQUIRED.filter((n) => !has(n));
  const missingRecommended = RECOMMENDED.filter((n) => !has(n));
  return {
    ready: !!state.dir && missing.length === 0,
    dir: state.dir,
    searched: [config.resourcesDir, uploadedResourcesDir()],
    missing, missingRecommended,
    frames: state.frames.size, sheets: state.sheets.size, iconCounts: state.iconCounts,
    error: state.error,
  };
}

export const hasFrame = (n) => state.frames.has(n);
export const iconCounts = () => state.iconCounts;
export const animDesc = (who) => state.anim[who] || null;

export function framesMatching(re, limit = 5000) {
  const out = [];
  for (const k of state.frames.keys()) { if (re.test(k)) out.push(k); if (out.length >= limit) break; }
  return out.sort();
}

// Atlas description for the client-side canvas renderer.
export function atlas(sheetKeys) {
  const sheets = {};
  const frames = {};
  for (const key of sheetKeys) {
    const s = state.sheets.get(key.toLowerCase());
    if (!s) continue;
    sheets[key.toLowerCase()] = { url: `/res/${encodeURIComponent(key.toLowerCase().replace(/\.plist$/, ".png"))}?q=${s.scale}`, scale: s.scale };
    for (const n of s.frames) {
      const f = state.frames.get(n);
      if (f.sheet !== key.toLowerCase()) continue;
      frames[n] = [key.toLowerCase(), f.x, f.y, f.w, f.h, f.rotated ? 1 : 0, f.ox, f.oy, f.sw, f.sh];
    }
  }
  return { sheets, frames };
}

export function sheetForPrefix(prefix) {
  return [...state.sheets.keys()].filter((k) => k.startsWith(prefix.toLowerCase()));
}

export function sheetPng(key, scale) {
  const list = state.files.get(key.toLowerCase());
  if (!list) return null;
  return (list.find((x) => x.scale === Number(scale)) || list.reduce((a, b) => (b.scale > a.scale ? b : a))).path;
}

export function font(name) {
  if (state.fonts.has(name)) return state.fonts.get(name);
  const f = findFile(`${name}.fnt`);
  if (!f) return null;
  const parsed = parseFnt(fs.readFileSync(f.path, "utf8"));
  parsed.scale = f.scale;
  parsed.pageUrls = parsed.pages.map((p) => {
    const { key } = logical(p);
    return `/res/${encodeURIComponent(key)}?q=${f.scale}`;
  });
  state.fonts.set(name, parsed);
  return parsed;
}

export function fontList() {
  return [...state.files.keys()].filter((k) => k.endsWith(".fnt") && !k.includes("/")).map((k) => k.replace(/\.fnt$/, "")).sort();
}

// Render a single frame (or a loose png) as an untrimmed PNG buffer, cached on disk.
const inflight = new Map();
export async function sprite(name) {
  const frame = state.frames.get(name);
  if (!frame) {
    const f = findFile(name) || findFile(name.endsWith(".png") ? name : `${name}.png`);
    return f ? { file: f.path } : null;
  }
  const cacheDir = path.join(config.dataDir, "cache", "sprites", String(state.loadedAt));
  const out = path.join(cacheDir, name.replace(/[^\w.-]/g, "_"));
  if (fs.existsSync(out)) return { file: out };
  if (inflight.has(out)) { await inflight.get(out); return { file: out }; }
  const job = (async () => {
    await fsp.mkdir(cacheDir, { recursive: true });
    const sheet = state.sheets.get(frame.sheet);
    const w = frame.rotated ? frame.h : frame.w;
    const h = frame.rotated ? frame.w : frame.h;
    let img = sharp(sheet.png).extract({ left: frame.x, top: frame.y, width: w, height: h });
    if (frame.rotated) img = sharp(await img.png().toBuffer()).rotate(-90);
    const buf = await img.png().toBuffer();
    // Pad back to the original (untrimmed) size so UI sprites line up like in game.
    const sw = Math.max(frame.sw, frame.w), sh = Math.max(frame.sh, frame.h);
    const left = Math.max(0, Math.round((sw - frame.w) / 2 + frame.ox));
    const top = Math.max(0, Math.round((sh - frame.h) / 2 - frame.oy));
    const padded = await sharp({ create: { width: sw, height: sh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: buf, left: Math.min(left, sw - frame.w), top: Math.min(top, sh - frame.h) }]).png().toBuffer();
    await fsp.writeFile(out, padded);
  })();
  inflight.set(out, job);
  try { await job; } finally { inflight.delete(out); }
  return { file: out };
}

export function resolveRes(key, q) {
  return sheetPng(key, q);
}
