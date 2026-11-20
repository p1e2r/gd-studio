// Canvas renderer for GD levels (editor + playtest). World units: 30 = one block, y up.
import { DEFAULT_COLORS } from "./level.js";
import { loadImage, tint } from "../gd.js";

const DEG = Math.PI / 180;

export function parseHsv(s) {
  if (!s) return null;
  const p = String(s).split("a");
  return { h: +p[0] || 0, s: p[1] === undefined ? 1 : +p[1], v: p[2] === undefined ? 1 : +p[2], sAdd: p[3] === "1", vAdd: p[4] === "1" };
}

export function applyHsv([r, g, b], hsv) {
  if (!hsv) return [r, g, b];
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  let s = max ? d / max : 0;
  let v = max;
  h = (h + hsv.h + 360) % 360;
  s = Math.min(1, Math.max(0, hsv.sAdd ? s + hsv.s : s * hsv.s));
  v = Math.min(1, Math.max(0, hsv.vAdd ? v + hsv.v : v * hsv.v));
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [rr, gg, bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((rr + m) * 255), Math.round((gg + m) * 255), Math.round((bb + m) * 255)];
}

// 2D affine helpers [a,b,c,d,e,f] like canvas
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const tr = (x, y) => [1, 0, 0, 1, x, y];
const rotm = (a) => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
const scl = (x, y) => [x, 0, 0, y, 0, 0];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export class Renderer {
  constructor(canvas, { atlas, db }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.atlas = atlas;
    this.db = db;
    this.cam = { x: 150, y: 120, zoom: 1.5 };
    this.dpr = window.devicePixelRatio || 1;
    this.level = null;
    this.sorted = [];
    this.dirty = true;
    this.localBB = new Map();
    this.playerColors = { 1005: [125, 255, 0], 1006: [0, 255, 255] };
    this.bgImg = null; this.groundImg = null;
    this._bgTint = {}; this._grTint = {};
    this.runtime = null; // playtest overrides
  }

  setLevel(level) { this.level = level; this.dirty = true; this.loadBackgrounds(); }

  async loadBackgrounds() {
    const h = this.level?.header || {};
    const bg = String(Math.max(1, +h.kA6 || 1)).padStart(2, "0");
    const gr = String(Math.max(1, +h.kA7 || 1)).padStart(2, "0");
    const [bgImg, groundImg] = await Promise.all([
      loadImage(`/sprite/game_bg_${bg}_001.png`).catch(() => null),
      loadImage(`/sprite/groundSquare_${gr}_001.png`).catch(() => null)]);
    this._bgTint = {}; this._grTint = {};
    this.bgImg = bgImg; this.groundImg = groundImg;
    this.onAssets?.();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.W = r.width; this.H = r.height;
  }

  screenToWorld(sx, sy) {
    return [(sx - this.W / 2) / this.cam.zoom + this.cam.x, (this.H / 2 - sy) / this.cam.zoom + this.cam.y];
  }
  worldToScreen(wx, wy) {
    return [(wx - this.cam.x) * this.cam.zoom + this.W / 2, this.H / 2 - (wy - this.cam.y) * this.cam.zoom];
  }

  // ---------- colors ----------
  channel(id) {
    const rt = this.runtime?.colors?.get(id);
    if (rt) return rt;
    if (!id) return { rgb: [255, 255, 255], opacity: 1, blend: false };
    if (id === 1005 || id === 1006) return { rgb: this.playerColors[id], opacity: 1, blend: false };
    if (id === 1010) return { rgb: [0, 0, 0], opacity: 1, blend: false };
    if (id === 1011) return { rgb: [255, 255, 255], opacity: 1, blend: false };
    if (id === 1012) { const b = this.channel(1000).rgb; return { rgb: b.map((v) => Math.round(v + (255 - v) * 0.5)), opacity: 1, blend: false }; }
    const c = this.level?.color(id);
    if (!c) return { rgb: DEFAULT_COLORS[id] || [255, 255, 255], opacity: 1, blend: false };
    let rgb = [c.r, c.g, c.b];
    if (c.player === 1) rgb = this.playerColors[1005];
    else if (c.player === 2) rgb = this.playerColors[1006];
    else if (c.copy && c.copy !== id) rgb = applyHsv(this.channel(c.copy).rgb, parseHsv(c.hsv));
    return { rgb, opacity: c.opacity ?? 1, blend: !!c.blend };
  }

  sortObjects() {
    if (!this.dirty || !this.level) return;
    const db = this.db;
    this.sorted = this.level.objects.map((o, i) => {
      const d = db.get(o.id);
      return { o, i, zl: o.zLayer ?? d?.zLayer ?? 5, zo: o.zOrder ?? d?.zOrder ?? 2 };
    }).sort((a, b) => a.zl - b.zl || a.zo - b.zo || a.i - b.i).map((x) => x.o);
    this.dirty = false;
  }

  // Local (object space) bounding box of an object type, in units.
  localBox(id) {
    if (this.localBB.has(id)) return this.localBB.get(id);
    const d = this.db.get(id);
    let box = [-15, -15, 15, 15];
    if (d?.root) {
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      const visit = (n, m) => {
        const local = mul(m, mul(tr(n.x, n.y), mul(rotm(n.rot * DEG), scl(n.sx, n.sy))));
        const f = n.frame && this.atlas.get(n.frame);
        if (f) {
          const k = 30 / (31 * f.scale);
          const w = f.w * k, h = f.h * k, cx = f.ox * k - n.ax * w, cy = f.oy * k - n.ay * h;
          for (const [px, py] of [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx - w / 2, cy + h / 2], [cx + w / 2, cy + h / 2]]) {
            const [X, Y] = apply(local, px, py);
            minx = Math.min(minx, X); maxx = Math.max(maxx, X); miny = Math.min(miny, Y); maxy = Math.max(maxy, Y);
          }
        }
        n.back.forEach((c) => visit(c, local)); n.front.forEach((c) => visit(c, local));
      };
      visit(d.root, [1, 0, 0, 1, 0, 0]);
      if (minx < Infinity && maxx - minx > 0.5) box = [minx, miny, maxx, maxy];
    }
    this.localBB.set(id, box);
    return box;
  }

  objectMatrix(o, extra) {
    const x = o.x + (extra?.dx || 0), y = o.y + (extra?.dy || 0);
    const rot = o.rot + (extra?.rot || 0);
    return mul(tr(x, y), mul(rotm(-rot * DEG), scl((o.flipX ? -1 : 1) * o.sx, (o.flipY ? -1 : 1) * o.sy)));
  }

  // World AABB [minx,miny,maxx,maxy]
  worldBox(o, extra) {
    const b = this.localBox(o.id);
    const m = this.objectMatrix(o, extra);
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const [px, py] of [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]]) {
      const [X, Y] = apply(m, px, py);
      minx = Math.min(minx, X); maxx = Math.max(maxx, X); miny = Math.min(miny, Y); maxy = Math.max(maxy, Y);
    }
    return [minx, miny, maxx, maxy];
  }

  hitTest(o, wx, wy) {
    const b = this.localBox(o.id);
    const m = this.objectMatrix(o);
    const det = m[0] * m[3] - m[1] * m[2];
    if (!det) return false;
    const x = wx - m[4], y = wy - m[5];
    const lx = (m[3] * x - m[2] * y) / det, ly = (-m[1] * x + m[0] * y) / det;
    const pad = 2;
    return lx >= b[0] - pad && lx <= b[2] + pad && ly >= b[1] - pad && ly <= b[3] + pad;
  }

  objectAt(wx, wy, filter) {
    this.sortObjects();
    for (let i = this.sorted.length - 1; i >= 0; i--) {
      const o = this.sorted[i];
      if (filter && !filter(o)) continue;
      if (this.hitTest(o, wx, wy)) return o;
    }
    return null;
  }

  objectsInRect(x1, y1, x2, y2) {
    const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)], [ay, by] = [Math.min(y1, y2), Math.max(y1, y2)];
    return this.level.objects.filter((o) => { const b = this.worldBox(o); return b[2] >= ax && b[0] <= bx && b[3] >= ay && b[1] <= by; });
  }

  // ---------- drawing ----------
  drawNode(ctx, n, cols, override) {
    ctx.save();
    if (n.x || n.y) ctx.translate(n.x, n.y);
    if (n.rot) ctx.rotate(n.rot * DEG);
    if (n.sx !== 1 || n.sy !== 1) ctx.scale(n.sx, n.sy);
    for (const c of n.back) this.drawNode(ctx, c, cols, override);
    if (n.frame) {
      const rgb = override || (n.color === 2 ? [0, 0, 0] : n.color === 1 ? cols[1] : cols[0]);
      const f = this.atlas.tinted(n.frame, rgb);
      if (f) {
        const k = 30 / (31 * f.scale);
        const w = f.w * k, h = f.h * k;
        ctx.save();
        ctx.translate(f.ox * k - n.ax * w, f.oy * k - n.ay * h);
        ctx.scale(1, -1);
        if (n.opacity !== 1) ctx.globalAlpha *= n.opacity;
        ctx.drawImage(f.canvas, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
    for (const c of n.front) this.drawNode(ctx, c, cols, override);
    ctx.restore();
  }

  objectColors(o, d) {
    const c1 = this.channel(o.col1 ?? d?.col1 ?? 1004);
    const c2 = this.channel(o.col2 ?? d?.col2 ?? 0);
    let rgb1 = c1.rgb, rgb2 = c2.rgb;
    if (o.props["41"] === "1") rgb1 = applyHsv(rgb1, parseHsv(o.props["43"]));
    if (o.props["42"] === "1") rgb2 = applyHsv(rgb2, parseHsv(o.props["44"]));
    if (!(o.col1 ?? d?.col1)) rgb1 = [255, 255, 255];
    return { cols: [rgb1, rgb2], opacity: c1.opacity, blend: c1.blend };
  }

  drawObject(ctx, o, { override, alpha = 1, extra } = {}) {
    const d = this.db.get(o.id);
    const { cols, opacity, blend } = this.objectColors(o, d);
    ctx.save();
    const m = this.objectMatrix(o, extra);
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.globalAlpha = alpha * opacity;
    if (blend) ctx.globalCompositeOperation = "lighter";
    if (d?.root) this.drawNode(ctx, d.root, cols, override);
    else {
      ctx.fillStyle = override ? `rgb(${override})` : "rgba(255,255,255,0.35)";
      ctx.fillRect(-13, -13, 26, 26);
      ctx.scale(1, -1);
      ctx.fillStyle = "#000"; ctx.font = "9px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(String(o.id), 0, 3);
    }
    ctx.restore();
  }

  drawBackground(ctx) {
    const { W, H } = this;
    const bg = this.channel(1000).rgb;
    ctx.fillStyle = `rgb(${bg})`;
    ctx.fillRect(0, 0, W, H);
    if (this.bgImg) {
      const key = bg.join(",");
      const img = (this._bgTint[key] ||= tint(this.bgImg, bg));
      const h = H, w = (img.width / img.height) * h;
      const off = -((this.cam.x * this.cam.zoom * 0.1) % w);
      for (let x = off - w; x < W; x += w) ctx.drawImage(img, x, 0, w, h);
    }
  }

  drawGround(ctx, x0, x1) {
    const g = this.channel(1001).rgb;
    const z = this.cam.zoom;
    const [, sy] = this.worldToScreen(0, 0);
    if (sy > this.H) return;
    ctx.fillStyle = `rgb(${g})`;
    ctx.fillRect(0, sy, this.W, this.H - sy);
    if (this.groundImg) {
      const key = g.join(",");
      const img = (this._grTint[key] ||= tint(this.groundImg, g));
      const size = 128 * z;
      const startX = Math.floor(x0 / 128) * 128;
      for (let x = startX; x < x1; x += 128) {
        const [sx] = this.worldToScreen(x, 0);
        ctx.drawImage(img, sx, sy, size, size);
      }
    }
    const line = this.channel(1002).rgb;
    const grad = ctx.createLinearGradient(0, 0, this.W, 0);
    grad.addColorStop(0, `rgba(${line},0)`); grad.addColorStop(0.5, `rgba(${line},1)`); grad.addColorStop(1, `rgba(${line},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, sy - 1, this.W, 2);
  }

  draw({ editor = true, selection = new Set(), grid = true, extraDraw, hidden } = {}) {
    const ctx = this.ctx;
    this.sortObjects();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground(ctx);
    const [x0, y1] = this.screenToWorld(0, 0);
    const [x1, y0] = this.screenToWorld(this.W, this.H);
    const z = this.cam.zoom;

    if (editor && grid) {
      ctx.strokeStyle = "rgba(0,0,0,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = Math.floor(x0 / 30) * 30; gx <= x1; gx += 30) { const [sx] = this.worldToScreen(gx, 0); ctx.moveTo(Math.round(sx) + 0.5, 0); ctx.lineTo(Math.round(sx) + 0.5, this.H); }
      for (let gy = Math.floor(y0 / 30) * 30; gy <= y1; gy += 30) { const [, sy] = this.worldToScreen(0, gy); ctx.moveTo(0, Math.round(sy) + 0.5); ctx.lineTo(this.W, Math.round(sy) + 0.5); }
      ctx.stroke();
      const [sx0] = this.worldToScreen(0, 0);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath(); ctx.moveTo(sx0, 0); ctx.lineTo(sx0, this.H); ctx.stroke();
    }

    // world transform: y up
    ctx.setTransform(z * this.dpr, 0, 0, -z * this.dpr, (this.W / 2 - this.cam.x * z) * this.dpr, (this.H / 2 + this.cam.y * z) * this.dpr);
    const rt = this.runtime;
    const margin = 120;
    for (const o of this.sorted) {
      if (o.x < x0 - margin || o.x > x1 + margin || o.y < y0 - margin || o.y > y1 + margin) {
        if (!rt?.moved?.has(o)) continue;
      }
      const d = this.db.get(o.id);
      if (!editor && d?.editorOnly) continue;
      if (hidden?.(o)) continue;
      const extra = rt?.offsets?.get(o);
      let alpha = 1;
      if (rt) { alpha = rt.alpha(o); if (alpha <= 0) continue; }
      this.drawObject(ctx, o, { override: selection.has(o) ? [0, 255, 0] : null, alpha, extra });
    }
    extraDraw?.(ctx);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawGround(ctx, x0, x1);
  }

  // Draw an object centered into a small canvas (build tab buttons)
  thumb(canvas, id) {
    const ctx = canvas.getContext("2d");
    const b = this.localBox(id);
    const w = b[2] - b[0], h = b[3] - b[1];
    const s = Math.min(canvas.width / Math.max(w, 30), canvas.height / Math.max(h, 30)) * 0.85;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.setTransform(s, 0, 0, -s, canvas.width / 2 - ((b[0] + b[2]) / 2) * s, canvas.height / 2 + ((b[1] + b[3]) / 2) * s);
    const d = this.db.get(id);
    const fake = { id, x: 0, y: 0, rot: 0, flipX: false, flipY: false, sx: 1, sy: 1, col1: null, col2: null, props: {} };
    if (d?.root) {
      const col1 = d.col1 ? (d.col1 === 1004 || d.col1 === 1 ? [255, 255, 255] : this.channel(d.col1).rgb) : [255, 255, 255];
      const col2 = d.col2 ? [170, 170, 170] : [255, 255, 255];
      this.drawNode(ctx, d.root, [col1, col2]);
    } else this.drawObject(ctx, fake);
    ctx.restore();
  }
}
