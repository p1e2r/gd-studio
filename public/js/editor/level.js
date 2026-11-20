// GD level string model: header + color channels + objects. Unknown keys are preserved.

export const SPECIAL_CHANNELS = { 1000: "BG", 1001: "G1", 1002: "Line", 1003: "3DL", 1004: "Obj", 1005: "P1", 1006: "P2", 1007: "LBG", 1009: "G2", 1010: "Black", 1011: "White", 1012: "Lighter", 1013: "MG", 1014: "MG2" };

export const DEFAULT_COLORS = {
  1000: [40, 125, 255], 1001: [0, 102, 255], 1002: [255, 255, 255], 1003: [255, 255, 255], 1004: [255, 255, 255],
  1009: [0, 102, 255], 1010: [0, 0, 0], 1011: [255, 255, 255], 1012: [255, 255, 255], 1013: [40, 125, 255], 1014: [40, 125, 255],
};

const FIELD = { 1: "id", 2: "x", 3: "y", 4: "flipX", 5: "flipY", 6: "rot", 20: "layer", 21: "col1", 22: "col2", 24: "zLayer", 25: "zOrder", 57: "groups" };

let uid = 1;
export class GDObject {
  constructor(id = 1, x = 15, y = 15) {
    this.uid = uid++;
    this.id = id; this.x = x; this.y = y;
    this.rot = 0; this.flipX = false; this.flipY = false;
    this.sx = 1; this.sy = 1;
    this.groups = [];
    this.layer = 0; this.col1 = null; this.col2 = null; this.zLayer = null; this.zOrder = null;
    this.props = {}; // other keys -> string
  }
  clone() {
    const o = new GDObject(this.id, this.x, this.y);
    Object.assign(o, { rot: this.rot, flipX: this.flipX, flipY: this.flipY, sx: this.sx, sy: this.sy, groups: [...this.groups], layer: this.layer, col1: this.col1, col2: this.col2, zLayer: this.zLayer, zOrder: this.zOrder, props: { ...this.props } });
    return o;
  }
  get(k, d) { const v = this.props[k]; return v === undefined ? d : v; }
  num(k, d = 0) { const v = this.props[k]; return v === undefined || v === "" ? d : Number(v); }
  bool(k) { return this.props[k] === "1"; }
  set(k, v) { if (v === null || v === undefined || v === "" || v === false) delete this.props[k]; else this.props[k] = v === true ? "1" : String(v); }
  snapshot() { return { id: this.id, x: this.x, y: this.y, rot: this.rot, flipX: this.flipX, flipY: this.flipY, sx: this.sx, sy: this.sy, groups: [...this.groups], layer: this.layer, col1: this.col1, col2: this.col2, zLayer: this.zLayer, zOrder: this.zOrder, props: { ...this.props } }; }
  restore(s) { Object.assign(this, { ...s, groups: [...s.groups], props: { ...s.props } }); }
}

export function parseObject(str) {
  const p = str.split(",");
  const o = new GDObject();
  for (let i = 0; i + 1 < p.length; i += 2) {
    const k = p[i], v = p[i + 1];
    const f = FIELD[k];
    if (f === "id") o.id = Number(v);
    else if (f === "x" || f === "y" || f === "rot") o[f] = Number(v) || 0;
    else if (f === "flipX" || f === "flipY") o[f] = v === "1";
    else if (f === "groups") o.groups = v.split(".").map(Number).filter(Boolean);
    else if (f) o[f] = v === "" ? null : Number(v);
    else if (k === "32") { o.sx = o.sy = Number(v) || 1; }
    else if (k === "128") o.sx = Number(v) || 1;
    else if (k === "129") o.sy = Number(v) || 1;
    else o.props[k] = v;
  }
  return o;
}

const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

export function serializeObject(o) {
  const out = [`1,${o.id}`, `2,${fmtNum(o.x)}`, `3,${fmtNum(o.y)}`];
  if (o.flipX) out.push("4,1");
  if (o.flipY) out.push("5,1");
  if (o.rot) out.push(`6,${fmtNum(o.rot)}`);
  if (o.layer) out.push(`20,${o.layer}`);
  if (o.col1 !== null && o.col1 !== undefined) out.push(`21,${o.col1}`);
  if (o.col2 !== null && o.col2 !== undefined) out.push(`22,${o.col2}`);
  if (o.zLayer !== null && o.zLayer !== undefined) out.push(`24,${o.zLayer}`);
  if (o.zOrder !== null && o.zOrder !== undefined) out.push(`25,${o.zOrder}`);
  if (o.sx !== 1 || o.sy !== 1) {
    if (o.sx === o.sy) out.push(`32,${fmtNum(o.sx)}`);
    else out.push(`128,${fmtNum(o.sx)}`, `129,${fmtNum(o.sy)}`);
  }
  if (o.groups.length) out.push(`57,${o.groups.join(".")}`);
  for (const [k, v] of Object.entries(o.props)) out.push(`${k},${v}`);
  return out.join(",");
}

export function parseColorString(str) {
  const colors = new Map();
  for (const entry of (str || "").split("|")) {
    if (!entry) continue;
    const p = entry.split("_");
    const c = {};
    for (let i = 0; i + 1 < p.length; i += 2) c[p[i]] = p[i + 1];
    const id = Number(c[6]);
    if (!id) continue;
    colors.set(id, {
      r: Number(c[1] ?? 255), g: Number(c[2] ?? 255), b: Number(c[3] ?? 255),
      player: Number(c[4] ?? -1), blend: c[5] === "1", opacity: c[7] === undefined ? 1 : Number(c[7]),
      copy: Number(c[9] || 0), hsv: c[10] || "", copyOpacity: c[17] === "1", raw: c,
    });
  }
  return colors;
}

export function serializeColors(colors) {
  return [...colors.entries()].sort((a, b) => a[0] - b[0]).map(([id, c]) => {
    const raw = { ...(c.raw || {}) };
    Object.assign(raw, { 1: c.r, 2: c.g, 3: c.b, 4: c.player ?? -1, 6: id, 7: c.opacity ?? 1, 8: 1 });
    if (c.blend) raw[5] = 1; else delete raw[5];
    if (c.copy) { raw[9] = c.copy; raw[10] = c.hsv || "0a1a0a0a0"; } else { delete raw[9]; delete raw[10]; }
    if (c.copyOpacity) raw[17] = 1; else delete raw[17];
    return Object.entries(raw).map(([k, v]) => `${k}_${v}`).join("_");
  }).join("|") + "|";
}

export class Level {
  constructor() {
    this.header = { kA13: "0", kA15: "0", kA16: "0", kA14: "", kA6: "0", kA7: "0", kA17: "0", kA18: "0", kS39: "0", kA2: "0", kA3: "0", kA8: "0", kA4: "0", kA9: "0", kA10: "0", kA11: "0" };
    this.colors = new Map([[1000, { r: 40, g: 125, b: 255, player: -1, blend: false, opacity: 1 }], [1001, { r: 0, g: 102, b: 255, player: -1, blend: false, opacity: 1 }]]);
    this.objects = [];
  }
  static parse(raw) {
    const lvl = new Level();
    if (!raw) return lvl;
    const parts = raw.split(";");
    const head = parts.shift() || "";
    const hp = head.split(",");
    lvl.header = {};
    for (let i = 0; i + 1 < hp.length; i += 2) lvl.header[hp[i]] = hp[i + 1];
    lvl.colors = parseColorString(lvl.header.kS38);
    if (!lvl.header.kS38) {
      // legacy (1.9) colors
      const legacy = (a, b, c, id) => {
        if (lvl.header[a] !== undefined) lvl.colors.set(id, { r: +lvl.header[a], g: +lvl.header[b], b: +lvl.header[c], player: -1, blend: false, opacity: 1 });
      };
      legacy("kS1", "kS2", "kS3", 1000); legacy("kS4", "kS5", "kS6", 1001); legacy("kS7", "kS8", "kS9", 1002); legacy("kS10", "kS11", "kS12", 1004);
    }
    delete lvl.header.kS38;
    for (const p of parts) if (p.includes(",")) lvl.objects.push(parseObject(p));
    return lvl;
  }
  serialize() {
    const head = Object.entries({ kS38: serializeColors(this.colors), ...this.header }).map(([k, v]) => `${k},${v}`).join(",");
    return `${head};${this.objects.map(serializeObject).join(";")};`;
  }
  color(id) {
    return this.colors.get(id) || null;
  }
}

export const GAMEMODES = ["Cube", "Ship", "Ball", "UFO", "Wave", "Robot", "Spider", "Swing"];
export const SPEEDS = [["1x", 0], ["0.5x", 1], ["2x", 2], ["3x", 3], ["4x", 4]];
