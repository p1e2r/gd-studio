// Client-side GD asset helpers: sprite atlases, tinting, bitmap fonts, icon compositing.
import { api, h } from "./core.js";

export const spriteUrl = (name) => `/sprite/${encodeURIComponent(name)}`;

export function sprite(name, attrs = {}) {
  const img = h("img", { src: spriteUrl(name), alt: "", draggable: "false", ...attrs });
  img.addEventListener("error", () => img.classList.add("missing"), { once: true });
  return img;
}

const imgCache = new Map();
export function loadImage(url) {
  if (!imgCache.has(url)) {
    imgCache.set(url, new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`image ${url}`));
      i.src = url;
    }));
  }
  return imgCache.get(url);
}

// ---------------- atlas ----------------
export class Atlas {
  constructor(json, images) {
    this.frames = json.frames; // name -> [sheet,x,y,w,h,rot,ox,oy,sw,sh]
    this.anim = json.anim || null;
    this.sheets = json.sheets;
    this.images = images;
    this.cache = new Map();
    this.tintCache = new Map();
  }
  static async load(path) {
    const json = await api(path);
    const images = {};
    await Promise.all(Object.entries(json.sheets).map(async ([k, s]) => {
      try { images[k] = await loadImage(s.url); } catch { /* missing sheet */ }
    }));
    return new Atlas(json, images);
  }
  has(name) { return !!(this.frames[name] && this.images[this.frames[name][0]]); }
  // Returns {canvas, w, h, ox, oy, scale} with the frame un-rotated. Sizes in sheet pixels.
  get(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const f = this.frames[name];
    const img = f && this.images[f[0]];
    if (!img) { this.cache.set(name, null); return null; }
    const [sheet, x, y, w, h, rot, ox, oy] = f;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (rot) {
      ctx.translate(0, h);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, x, y, h, w, 0, 0, h, w);
    } else ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
    const out = { canvas: c, w, h, ox, oy, sw: f[8], sh: f[9], scale: this.sheets[sheet]?.scale || 4 };
    this.cache.set(name, out);
    return out;
  }
  // Multiply-tinted copy of a frame. color = [r,g,b] 0-255
  tinted(name, color) {
    const base = this.get(name);
    if (!base) return null;
    if (!color || (color[0] === 255 && color[1] === 255 && color[2] === 255)) return base;
    const key = `${name}|${color.join(",")}`;
    let t = this.tintCache.get(key);
    if (t) return t;
    t = { ...base, canvas: tint(base.canvas, color) };
    if (this.tintCache.size > 6000) this.tintCache.clear();
    this.tintCache.set(key, t);
    return t;
  }
}

export function tint(src, [r, g, b]) {
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(src, 0, 0);
  return c;
}

let gameAtlasP = null;
export const gameAtlas = () => (gameAtlasP ||= Atlas.load("/atlas/game"));

// ---------------- fonts ----------------
const fontCache = new Map();
export function loadFont(name) {
  if (!fontCache.has(name)) {
    fontCache.set(name, (async () => {
      try {
        const data = await api(`/font/${encodeURIComponent(name)}`);
        const pages = await Promise.all(data.pageUrls.map(loadImage));
        return { ...data, images: pages };
      } catch { return null; }
    })());
  }
  return fontCache.get(name);
}

const TAG_COLORS = {
  cr: [255, 90, 90], cg: [64, 227, 72], cl: [96, 171, 239], cj: [50, 200, 255], cy: [255, 255, 0],
  co: [255, 165, 75], cp: [255, 0, 255], cb: [74, 82, 225], cf: [150, 255, 255], cs: [255, 220, 65], cc: [255, 255, 150], ca: [150, 50, 255], cd: [255, 150, 255],
};

// Split "<cr>red</c> text" into runs
function runs(text, base) {
  const out = [];
  let color = base;
  const re = /<(c[a-z])>|<\/c>/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), color });
    color = m[1] ? TAG_COLORS[m[1]] || base : base;
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last), color });
  return out;
}

// Render text with a GD bitmap font. Returns a canvas at the font's native pixel scale
// plus the native line height so callers can scale it.
export async function renderText(fontName, text, { color = null, align = "left", wrap = 0, spacing = 0, colorTags = true } = {}) {
  const font = await loadFont(fontName);
  const lines = String(text ?? "").split("\n");
  if (!font) return renderFallback(text, { color, align, wrap });
  const ch = (c) => font.chars[c.codePointAt(0)] || font.chars[63];
  const advance = (str) => {
    let w = 0;
    for (const c of str) { const g = ch(c); if (g) w += g[6] + spacing; }
    return w;
  };
  // word wrap (wrap given in native px)
  const wrapped = [];
  for (const line of lines) {
    if (!wrap) { wrapped.push(line); continue; }
    let cur = "";
    for (const word of line.split(" ")) {
      const test = cur ? `${cur} ${word}` : word;
      if (advance(test.replace(/<\/?c[a-z]?>/g, "")) > wrap && cur) { wrapped.push(cur); cur = word; } else cur = test;
    }
    wrapped.push(cur);
  }
  const plain = (s) => (colorTags ? s.replace(/<\/?c[a-z]?>/g, "") : s);
  const widths = wrapped.map((l) => advance(plain(l)));
  const W = Math.max(1, Math.ceil(Math.max(...widths, 1)));
  const H = Math.max(1, font.lineHeight * wrapped.length);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  wrapped.forEach((line, li) => {
    let x = align === "center" ? (W - widths[li]) / 2 : align === "right" ? W - widths[li] : 0;
    const y = li * font.lineHeight;
    for (const run of colorTags ? runs(line, color) : [{ text: line, color }]) {
      const glyphLayer = document.createElement("canvas");
      const rw = advance(run.text) + 8;
      glyphLayer.width = Math.max(1, Math.ceil(rw)); glyphLayer.height = font.lineHeight + 8;
      const g = glyphLayer.getContext("2d");
      let gx = 0;
      let prev = null;
      for (const chr of run.text) {
        const gl = ch(chr);
        if (!gl) continue;
        const k = prev ? font.kernings[`${prev},${chr.codePointAt(0)}`] || 0 : 0;
        const [sx, sy, sw, sh, xo, yo, xa, page] = gl;
        if (sw && sh) g.drawImage(font.images[page], sx, sy, sw, sh, gx + xo + k, yo, sw, sh);
        gx += xa + spacing + k;
        prev = chr.codePointAt(0);
      }
      ctx.drawImage(run.color ? tint(glyphLayer, run.color) : glyphLayer, x, y);
      x += gx;
    }
  });
  return { canvas: c, lineHeight: font.lineHeight, scale: font.scale };
}

function renderFallback(text, { color, align, wrap }) {
  const size = 64;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  ctx.font = `bold ${size}px "Arial Rounded MT Bold", "Trebuchet MS", sans-serif`;
  const lines = String(text ?? "").replace(/<\/?c[a-z]?>/g, "").split("\n");
  const wrapped = [];
  for (const line of lines) {
    if (!wrap) { wrapped.push(line); continue; }
    let cur = "";
    for (const w of line.split(" ")) {
      const t = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(t).width > wrap * 2 && cur) { wrapped.push(cur); cur = w; } else cur = t;
    }
    wrapped.push(cur);
  }
  const W = Math.ceil(Math.max(1, ...wrapped.map((l) => ctx.measureText(l).width))) + 16;
  c.width = W; c.height = size * 1.25 * wrapped.length + 8;
  ctx.font = `bold ${size}px "Arial Rounded MT Bold", "Trebuchet MS", sans-serif`;
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#000";
  ctx.fillStyle = color ? `rgb(${color.join(",")})` : "#fff";
  ctx.textAlign = align;
  const x = align === "center" ? W / 2 : align === "right" ? W - 8 : 8;
  wrapped.forEach((l, i) => { ctx.strokeText(l, x, i * size * 1.25 + 4); ctx.fillText(l, x, i * size * 1.25 + 4); });
  return { canvas: c, lineHeight: size * 1.25, scale: 2, fallback: true };
}

export const hexToRgb = (hex) => {
  const m = String(hex).replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
};

// <gd-text font="bigFont" size="32" color="#ffcc00" align="center" wrap="300">Hello</gd-text>
class GDText extends HTMLElement {
  static get observedAttributes() { return ["font", "size", "color", "align", "wrap", "text"]; }
  connectedCallback() { this.render(); }
  attributeChangedCallback() { if (this.isConnected) this.render(); }
  set text(v) { this.setAttribute("text", v); }
  async render() {
    const token = (this._t = (this._t || 0) + 1);
    const text = this.getAttribute("text") ?? this.textContent;
    if (!this.hasAttribute("text")) this.setAttribute("text", text);
    const size = Number(this.getAttribute("size") || 32);
    const wrapCss = Number(this.getAttribute("wrap") || 0);
    const fontName = this.getAttribute("font") || "bigFont";
    const font = await loadFont(fontName);
    const nativeLH = font?.lineHeight || 80;
    const ratio = nativeLH / size;
    const r = await renderText(fontName, text, {
      color: hexToRgb(this.getAttribute("color") || ""), align: this.getAttribute("align") || "left", wrap: wrapCss ? wrapCss * ratio : 0,
    });
    if (token !== this._t) return;
    const k = size / r.lineHeight;
    r.canvas.style.width = `${r.canvas.width * k}px`;
    r.canvas.style.height = `${r.canvas.height * k}px`;
    r.canvas.setAttribute("aria-hidden", "true");
    this.replaceChildren(r.canvas, h("span", { class: "sr" }, text.replace(/<\/?c[a-z]?>/g, "")));
  }
}
customElements.define("gd-text", GDText);

export const text = (str, attrs = {}) => h("gd-text", { ...attrs, text: str });

// ---------------- icons ----------------
let colorsP = null;
export const playerColors = () => (colorsP ||= fetch("/data/colors.json").then((r) => r.json()).then((c) => {
  const out = [];
  for (const [k, v] of Object.entries(c)) out[+k] = v.split(",").map(Number);
  return out;
}));

const iconAtlasCache = new Map();
export function iconAtlas(form, id) {
  const k = `${form}/${id}`;
  if (!iconAtlasCache.has(k)) iconAtlasCache.set(k, Atlas.load(`/icons/${form}/${id}`).catch(() => null));
  return iconAtlasCache.get(k);
}

const PREFIX = { cube: "player", ship: "ship", ball: "player_ball", ufo: "bird", wave: "dart", robot: "robot", spider: "spider", swing: "swing", jetpack: "jetpack" };

// Approximate idle poses (GD points) used when the AnimDesc plist can't be mapped.
const POSES = {
  robot: [
    { p: 2, x: -6, y: -11, r: 30, back: 1 }, { p: 3, x: -9, y: -19, r: -20, back: 1 }, { p: 4, x: -6, y: -24, back: 1 },
    { p: 1, x: 2, y: 5 },
    { p: 2, x: 6, y: -11, r: 15 }, { p: 3, x: 4, y: -19, r: -10 }, { p: 4, x: 8, y: -24 },
  ],
  spider: [
    { p: 2, x: -14, y: -12, back: 1 }, { p: 3, x: -18, y: -20, back: 1 },
    { p: 2, x: 12, y: -12, back: 1, fx: 1 }, { p: 3, x: 16, y: -20, back: 1, fx: 1 },
    { p: 1, x: 0, y: 2 },
    { p: 2, x: -8, y: -12 }, { p: 3, x: -12, y: -20 },
    { p: 2, x: 8, y: -12, fx: 1 }, { p: 3, x: 12, y: -20, fx: 1 },
  ],
};

function drawLayer(ctx, atlas, name, color, { x = 0, y = 0, rot = 0, sx = 1, sy = 1, unit }) {
  const f = color ? atlas.tinted(name, color) : atlas.get(name);
  if (!f) return false;
  const px = unit / (f.scale * 31 / 30); // css px per sheet px
  ctx.save();
  ctx.translate(x * unit, -y * unit);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(sx, sy);
  ctx.translate(f.ox * px, -f.oy * px);
  ctx.drawImage(f.canvas, (-f.w * px) / 2, (-f.h * px) / 2, f.w * px, f.h * px);
  ctx.restore();
  return true;
}

// Draw an icon centered at (0,0) in ctx. unit = canvas px per GD point.
export async function drawIcon(ctx, { form = "cube", id = 1, col1 = 0, col2 = 3, col3 = null, glow = false, unit = 2 }) {
  const atlas = await iconAtlas(form, id);
  const colors = await playerColors();
  if (!atlas) return false;
  const c1 = colors[col1] || [175, 175, 175];
  const c2 = colors[col2] || [255, 255, 255];
  const cg = colors[col3 ?? col2] || c2;
  const base = `${PREFIX[form]}_${String(id).padStart(2, "0")}`;
  const part = (pre, opts) => {
    if (glow) drawLayer(ctx, atlas, `${pre}_glow_001.png`, cg, opts);
  };
  const layers = (pre, opts, dim = 1) => {
    const d = (c) => (dim === 1 ? c : c.map((v) => Math.round(v * dim)));
    drawLayer(ctx, atlas, `${pre}_2_001.png`, d(c2), opts);
    drawLayer(ctx, atlas, `${pre}_001.png`, d(c1), opts);
    drawLayer(ctx, atlas, `${pre}_extra_001.png`, dim === 1 ? null : d([255, 255, 255]), opts);
  };
  if (form === "robot" || form === "spider") {
    const container = atlas.anim?.animationContainer;
    const idleKey = container && Object.keys(container).find((k) => /idle_001/i.test(k));
    if (idleKey) {
      // GD's own idle pose from Robot_AnimDesc / Spider_AnimDesc
      const nums = (str) => String(str || "").replace(/[{}\s]/g, "").split(",").map(Number);
      const parts = Object.values(container[idleKey]).map((p) => {
        const m = String(p.texture || "").match(/_(\d\d)_001\.png$/);
        const [px, py] = nums(p.position);
        const [sx, sy] = nums(p.scale);
        const [fx, fy] = nums(p.flipped);
        return { part: m ? m[1] : "01", x: px || 0, y: py || 0, sx: (sx || 1) * (fx ? -1 : 1), sy: (sy || 1) * (fy ? -1 : 1), rot: +p.rotation || 0, z: +p.zValue || 0 };
      }).sort((a, b) => a.z - b.z);
      const headZ = parts.find((p) => p.part === "01")?.z ?? 99;
      for (const q of parts) part(`${base}_${q.part}`, { x: q.x, y: q.y, rot: q.rot, sx: q.sx, sy: q.sy, unit });
      for (const q of parts) layers(`${base}_${q.part}`, { x: q.x, y: q.y, rot: q.rot, sx: q.sx, sy: q.sy, unit }, q.z < headZ ? 0.6 : 1);
      return true;
    }
    const pose = POSES[form];
    for (const q of pose) part(`${base}_0${q.p}`, { x: q.x, y: q.y, rot: q.r || 0, sx: q.fx ? -1 : 1, unit });
    for (const q of pose) layers(`${base}_0${q.p}`, { x: q.x, y: q.y, rot: q.r || 0, sx: q.fx ? -1 : 1, unit }, q.back ? 0.6 : 1);
    return true;
  }
  const opts = { unit };
  part(base, opts);
  if (form === "ufo") drawLayer(ctx, atlas, `${base}_3_001.png`, null, { ...opts, y: 0 });
  layers(base, opts);
  return true;
}

// Convenience: icon as a canvas element of a given css size
export function iconCanvas(opts, size = 64) {
  const c = h("canvas", { class: "icon-canvas", width: size * 2, height: size * 2 });
  c.style.width = c.style.height = `${size}px`;
  const ctx = c.getContext("2d");
  ctx.translate(size, size);
  drawIcon(ctx, { unit: (size * 2) / 42, ...opts }).then((ok) => { if (!ok) c.classList.add("missing"); });
  return c;
}

export const FORMS = ["cube", "ship", "ball", "ufo", "wave", "robot", "spider", "swing", "jetpack"];
export const ICON_TYPE_FORM = ["cube", "ship", "ball", "ufo", "wave", "robot", "spider", "swing", "jetpack"];
