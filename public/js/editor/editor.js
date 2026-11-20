// Level editor laid out like Geometry Dash's own EditorUI (build / edit / delete), no playtest.
import { h, toast } from "../core.js";
import { gameAtlas, text } from "../gd.js";
import { loadDb, TABS, TRIGGER_FIELDS, TRIGGER_NAMES, START_POS_FIELDS, EASINGS, LEGACY_COLOR_TARGET } from "./objdb.js";
import { Renderer } from "./render.js";
import { GDObject, SPECIAL_CHANNELS, GAMEMODES, SPEEDS } from "./level.js";
import { panel, btn, modal, OFFICIAL_SONGS } from "../ui.js";

const GRID = 30;
const snap = (v) => Math.floor(v / GRID) * GRID + GRID / 2;
const rgbHex = (r, g, b) => `#${[r, g, b].map((v) => (+v).toString(16).padStart(2, "0")).join("")}`;
const hexRgb = (hx) => [1, 3, 5].map((i) => parseInt(hx.slice(i, i + 2), 16));

// Candidate frame names for GD's own editor buttons (first one found in your GD install is used).
const F = {
  undo: ["GJ_undoBtn_001.png"], redo: ["GJ_redoBtn_001.png"], trash: ["GJ_trashBtn_001.png"],
  pause: ["GJ_pauseEditorBtn_001.png", "GJ_pauseBtn_001.png"], settings: ["GJ_optionsBtn_001.png", "GJ_optionsBtn02_001.png"],
  zoomIn: ["GJ_zoomInBtn_001.png"], zoomOut: ["GJ_zoomOutBtn_001.png"],
  arrowL: ["GJ_arrow_02_001.png", "GJ_arrow_01_001.png"], layerL: ["GJ_arrow_02_001.png"],
  up: ["edit_upBtn_001.png"], down: ["edit_downBtn_001.png"], left: ["edit_leftBtn_001.png"], right: ["edit_rightBtn_001.png"],
  up2: ["edit_upBtn2_001.png"], down2: ["edit_downBtn2_001.png"], left2: ["edit_leftBtn2_001.png"], right2: ["edit_rightBtn2_001.png"],
  up3: ["edit_upBtn3_001.png"], down3: ["edit_downBtn3_001.png"], left3: ["edit_leftBtn3_001.png"], right3: ["edit_rightBtn3_001.png"],
  up5: ["edit_upBtn5_001.png"], down5: ["edit_downBtn5_001.png"], left5: ["edit_leftBtn5_001.png"], right5: ["edit_rightBtn5_001.png"],
  flipX: ["edit_flipXBtn_001.png"], flipY: ["edit_flipYBtn_001.png"], cw: ["edit_cwBtn_001.png"], ccw: ["edit_ccwBtn_001.png"],
  cw45: ["edit_rotate45rBtn_001.png"], ccw45: ["edit_rotate45lBtn_001.png"],
  scale: ["edit_scaleBtn_001.png"], rotFree: ["edit_freeRotateBtn_001.png"], warp: ["edit_warpBtn_001.png"], scaleXY: ["edit_scaleXYBtn_001.png"],
  build: ["edit_buildBtn_001.png"], edit: ["edit_editBtn_001.png"], del: ["edit_deleteBtn_001.png"],
  swipe: ["edit_swipeBtn_001.png"], rotate: ["edit_enableRotateBtn_001.png"], freeMove: ["edit_freeMoveBtn_001.png"], snapT: ["edit_snapBtn_001.png"],
  copy: ["GJ_copyBtn_001.png"], paste: ["GJ_pasteBtn_001.png"], dup: ["GJ_duplicateBtn_001.png"], special: ["GJ_editObjBtn4_001.png"],
  group: ["GJ_groupIDBtn_001.png"], editObj: ["GJ_editObjBtn3_001.png"], deselect: ["GJ_deSelBtn2_001.png", "GJ_deSelBtn_001.png"],
  hsv: ["GJ_editHSVBtn2_001.png"], music: ["GJ_playMusicBtn_001.png"], delBig: ["edit_delBtn_001.png"], deselectSm: ["edit_deselectBtn_001.png"],
};

const LAYERS = [["B4", -3], ["B3", -1], ["B2", 1], ["B1", 3], ["T1", 5], ["T2", 7], ["T3", 9]];
const CHANNEL_QUICK = [["Def", null], ...Array.from({ length: 12 }, (_, i) => [String(i + 1), i + 1]), ["BG", 1000], ["G1", 1001], ["G2", 1009], ["Line", 1002], ["3DL", 1003], ["Obj", 1004], ["P1", 1005], ["P2", 1006], ["LBG", 1007], ["Blk", 1010], ["Wht", 1011]];

export class Editor {
  constructor(root, { level, meta = {}, readOnly = false, onSave, onExit, onUpload, onExport }) {
    this.root = root;
    this.level = level;
    this.meta = meta;
    this.readOnly = readOnly;
    this.onSave = onSave; this.onExit = onExit; this.onUpload = onUpload; this.onExport = onExport;
    this.mode = "build";
    this.selection = new Set();
    this.current = 1;
    this.tab = "block";
    this.page = 0;
    this.editPage = 0;
    this.toggles = { swipe: false, rotate: false, freeMove: true, snap: true };
    this.widget = null;
    this.layerFilter = null; // editor layer shown (null = all)
    this.history = []; this.future = [];
    this.clipboard = [];
    this.dirty = false;
    this.needsDraw = true;
  }

  async init() {
    document.body.classList.add("fullscreen");
    const [atlas, db] = await Promise.all([gameAtlas(), loadDb()]);
    this.atlas = atlas; this.db = db;
    this.canvas = h("canvas", { class: "ed-canvas" });
    this.renderer = new Renderer(this.canvas, { atlas, db });
    this.renderer.onAssets = () => this.redraw();
    this.renderer.setLevel(this.level);
    this.buildDom();
    this.renderer.resize();
    const z = Math.max(0.8, this.renderer.H / 360);
    this.renderer.cam = { x: this.renderer.W / 2 / z - 60, y: (this.renderer.H / 2 - this.renderer.H * 0.34) / z + 15, zoom: z };
    this.bind();
    this.loop();
    if (!Object.keys(atlas.frames).length) toast("GD sprite sheets not found — objects show as placeholders. See Setup.", "error");
    if (this.readOnly) toast("View only: the creator hasn't allowed copying this level.");
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    window.removeEventListener("resize", this.onResize);
    document.body.classList.remove("fullscreen");
  }

  // ================= GD-style widgets =================
  label(str, size = 16, font = "bigFont") { return text(str, { font, size }); }

  frameCanvas(cands, hPx) {
    const name = cands.find((n) => this.atlas.has(n));
    if (!name) return null;
    const f = this.atlas.get(name);
    const c = document.createElement("canvas");
    c.width = f.w; c.height = f.h;
    c.getContext("2d").drawImage(f.canvas, 0, 0);
    c.style.height = `${hPx}px`;
    c.style.width = `${(f.w / f.h) * hPx}px`;
    return c;
  }

  // GD sprite button; falls back to a grey GD button with a bitmap-font label
  sbtn(cands, fallback, fn, { size = 42, title, caption, flip } = {}) {
    const c = this.frameCanvas(cands, size);
    if (c && flip) c.style.transform = flip;
    const b = h("button", { class: `gd-sbtn ${c ? "" : "gd-grey fb"}`, title: title || caption || fallback, "aria-label": title || caption || fallback, onclick: fn, style: c ? undefined : { minWidth: `${size}px`, minHeight: `${size}px` } },
      c || this.label(fallback, Math.round(size * 0.36)));
    if (!caption) return b;
    return h("div", { class: "gd-capbtn" }, b, this.label(caption, 11));
  }

  // Grey GD square (GJ_tabOff / GJ_tabOn) with a sprite or canvas on top — used for modes, toggles, edit buttons, objects
  sq(content, fn, { on = false, title, cls = "", size } = {}) {
    const b = h("button", { class: `gd-sq ${on ? "on" : ""} ${cls}`, title, "aria-label": title, onclick: fn, style: size ? { width: `${size}px`, height: `${size}px` } : undefined }, content);
    return b;
  }
  sqSprite(cands, fallback, fn, opts = {}) {
    const c = this.frameCanvas(cands, opts.inner || 34);
    if (c && opts.flip) c.style.transform = opts.flip;
    return this.sq(c || this.label(fallback, 12), fn, { title: opts.title || fallback, ...opts });
  }

  // GD text button (GJ_button_0X 9-slice) — grey by default
  tbtn(label, fn, { color = "grey", size = 16, cls = "" } = {}) {
    return h("button", { class: `gd-tbtn gd-${color} ${cls}`, onclick: fn }, this.label(label, size));
  }

  // ================= DOM =================
  buildDom() {
    this.infoEl = h("div", { class: "ge-info" });
    this.layerEl = h("div", { class: "ge-layer" });
    this.modeBtns = {};
    this.toggleBtns = {};
    const modes = h("div", { class: "ge-modes" }, ...[["build", "Build", F.build], ["edit", "Edit", F.edit], ["delete", "Delete", F.del]].map(([m, l, fr]) => {
      const b = this.sqSprite(fr, l, () => this.setMode(m), { title: `${l} (${m === "build" ? 1 : m === "edit" ? 2 : 3})`, cls: "ge-mode", inner: 40 });
      this.modeBtns[m] = b;
      return b;
    }));
    this.tabsEl = h("div", { class: "ge-tabs" });
    this.gridEl = h("div", { class: "ge-grid" });
    this.dotsEl = h("div", { class: "ge-dots" });
    const arrowL = this.sbtn(F.arrowL, "<", () => this.turnPage(-1), { size: 46, title: "Previous page" });
    const arrowR = this.sbtn(F.arrowL, ">", () => this.turnPage(1), { size: 46, title: "Next page", flip: "scaleX(-1)" });
    const toggles = h("div", { class: "ge-toggles" }, ...[["swipe", "Swipe", F.swipe, "T"], ["rotate", "Rotate", F.rotate, "R"], ["freeMove", "Free Move", F.freeMove, "F"], ["snap", "Snap", F.snapT, "G"]].map(([k, l, fr, key]) => {
      const b = this.sqSprite(fr, l, () => this.toggle(k), { title: `${l} (${key})`, cls: "ge-toggle", inner: 34 });
      this.toggleBtns[k] = b;
      return b;
    }));
    this.bottom = h("div", { class: "ge-bottom" }, modes,
      h("div", { class: "ge-center" }, this.tabsEl, h("div", { class: "ge-pages" }, arrowL, this.gridEl, arrowR), this.dotsEl),
      toggles);

    const topLeft = h("div", { class: "ge-topleft" },
      this.sbtn(F.undo, "Undo", () => this.undo(), { size: 40, title: "Undo (Ctrl+Z)" }),
      this.sbtn(F.redo, "Redo", () => this.redo(), { size: 40, title: "Redo (Ctrl+Y)" }),
      this.sbtn(F.trash, "Del", () => this.deleteSelected(), { size: 40, title: "Delete selected (Del)" }));
    const topRight = h("div", { class: "ge-topright" },
      this.sbtn(F.settings, "Set", () => this.settingsPopup(), { size: 40, title: "Level settings" }),
      this.sbtn(F.pause, "| |", () => this.pausePopup(), { size: 40, title: "Pause" }));
    const right = h("div", { class: "ge-right" },
      this.sbtn(F.copy, "Copy", () => this.copy(), { size: 44, title: "Copy (Ctrl+C)" }),
      this.sbtn(F.paste, "Paste", () => this.paste(), { size: 44, title: "Paste (Ctrl+V)" }),
      this.sbtn(F.dup, "Copy+Paste", () => { this.copy(); this.paste(); }, { size: 44, title: "Copy + Paste (Ctrl+D)" }),
      this.sbtn(F.special, "Edit Special", () => this.specialPopup(), { size: 44, title: "Edit Special" }),
      this.sbtn(F.group, "Edit Group", () => this.editGroupPopup(), { size: 44, title: "Edit Group" }),
      this.sbtn(F.editObj, "Edit Object", () => this.editObjectPopup(), { size: 44, title: "Edit Object" }),
      this.sbtn(F.deselect, "Deselect", () => this.select([]), { size: 44, title: "Deselect" }));
    const zoom = h("div", { class: "ge-zoom" },
      this.sbtn(F.zoomIn, "+", () => this.zoom(1.25), { size: 34, title: "Zoom in" }),
      this.sbtn(F.zoomOut, "-", () => this.zoom(0.8), { size: 34, title: "Zoom out" }));
    this.root.replaceChildren(h("div", { class: "ed-root ge" }, this.canvas, topLeft, this.infoEl, topRight, right, zoom, this.layerEl, this.bottom));
    this.renderLayer();
    this.renderToggles();
    this.setMode("build");
  }

  toggle(k) {
    this.toggles[k] = !this.toggles[k];
    if (k === "rotate") this.widget = this.toggles.rotate ? "rotate" : null;
    this.renderToggles();
    if (this.mode === "delete") this.renderPage();
    this.redraw();
  }
  renderToggles() {
    for (const [k, b] of Object.entries(this.toggleBtns)) b.classList.toggle("on", this.toggles[k]);
  }

  renderLayer() {
    const arrow = (d, flip) => this.sbtn(F.layerL, d < 0 ? "<" : ">", () => {
      const cur = this.layerFilter ?? -1;
      const n = Math.max(-1, cur + d);
      this.layerFilter = n < 0 ? null : n;
      this.renderLayer(); this.redraw();
    }, { size: 24, flip, title: "Editor layer" });
    this.layerEl.replaceChildren(arrow(-1), this.label(this.layerFilter === null ? "All" : String(this.layerFilter), 18), arrow(1, "scaleX(-1)"));
  }

  setMode(m) {
    this.mode = m;
    for (const [k, b] of Object.entries(this.modeBtns)) b.classList.toggle("on", k === m);
    this.tabsEl.style.visibility = m === "build" ? "" : "hidden";
    this.renderPage();
    this.redraw();
  }

  // ---------- bottom pages ----------
  perPage() {
    const w = this.gridEl.clientWidth || 600;
    const hgt = this.gridEl.clientHeight || 120;
    const cell = Math.max(40, Math.min(62, Math.floor(hgt / 2) - 4));
    const cols = Math.max(3, Math.floor(w / (cell + 6)));
    return { cols, rows: 2, n: cols * 2, cell };
  }

  renderTabs() {
    this.tabsEl.replaceChildren(...TABS.map(([label, key]) => {
      const ids = this.db.byTab[key];
      const c = h("canvas", { width: 60, height: 60 });
      if (ids[0]) this.renderer.thumb(c, ids[0]);
      return this.sq(c, () => { this.tab = key; this.page = 0; this.renderPage(); }, { on: this.tab === key, title: label, cls: "ge-tab" });
    }));
  }

  renderPage() {
    if (this.mode === "build") return this.renderBuild();
    const items = this.mode === "edit" ? this.editItems() : this.deleteItems();
    const { cols, n } = this.perPage();
    const pages = Math.max(1, Math.ceil(items.length / n));
    this.editPage = Math.max(0, Math.min(this.editPage, pages - 1));
    this.gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    this.gridEl.className = "ge-grid ge-editgrid";
    this.gridEl.replaceChildren(...items.slice(this.editPage * n, this.editPage * n + n));
    this.renderDots(pages, this.editPage);
  }

  renderBuild() {
    this.renderTabs();
    const ids = this.db.byTab[this.tab] || [];
    const { cols, n, cell } = this.perPage();
    const pages = Math.max(1, Math.ceil(ids.length / n));
    this.page = Math.max(0, Math.min(this.page, pages - 1));
    this.gridEl.className = "ge-grid";
    this.gridEl.style.gridTemplateColumns = `repeat(${cols}, ${cell}px)`;
    this.gridEl.replaceChildren(...ids.slice(this.page * n, this.page * n + n).map((id) => {
      const c = h("canvas", { width: 96, height: 96 });
      this.renderer.thumb(c, id);
      const name = TRIGGER_NAMES[id] ? `${TRIGGER_NAMES[id]} (${id})` : `Object ${id}`;
      return this.sq(c, () => { this.current = id; this.renderBuild(); }, { on: this.current === id, title: name, cls: "ge-obj", size: cell });
    }));
    this.renderDots(pages, this.page);
  }

  renderDots(pages, cur) {
    this.dotsEl.replaceChildren(...(pages > 1 ? Array.from({ length: Math.min(pages, 30) }, (_, i) => h("span", { class: `ge-dot ${i === cur ? "on" : ""}` })) : []));
  }

  turnPage(d) {
    if (this.mode === "build") { this.page += d; this.renderBuild(); } else { this.editPage += d; this.renderPage(); }
  }

  editItems() {
    const wrap = (b, cap) => h("div", { class: "gd-capbtn" }, b, this.label(cap, 10));
    const m = (cands, fb, cap, dx, dy) => wrap(this.sqSprite(cands, fb, () => this.moveSel(dx, dy), { title: cap, inner: 26, size: 46 }), cap);
    const a = (cands, fb, cap, fn, flip) => wrap(this.sqSprite(cands, fb, fn, { title: cap, inner: 30, size: 46, flip }), cap);
    return [
      m(F.up, "^", "Up", 0, 30), m(F.down, "v", "Down", 0, -30), m(F.left, "<", "Left", -30, 0), m(F.right, ">", "Right", 30, 0),
      m(F.up2, "^", "Small", 0, 2), m(F.down2, "v", "Small", 0, -2), m(F.left2, "<", "Small", -2, 0), m(F.right2, ">", "Small", 2, 0),
      m(F.up3, "^", "Tiny", 0, 0.5), m(F.down3, "v", "Tiny", 0, -0.5), m(F.left3, "<", "Tiny", -0.5, 0), m(F.right3, ">", "Tiny", 0.5, 0),
      m(F.up5, "^", "Big", 0, 150), m(F.down5, "v", "Big", 0, -150), m(F.left5, "<", "Big", -150, 0), m(F.right5, ">", "Big", 150, 0),
      m(F.up, "^", "Half", 0, 15), m(F.down, "v", "Half", 0, -15), m(F.left, "<", "Half", -15, 0), m(F.right, ">", "Half", 15, 0),
      a(F.flipX, "FX", "Flip X", () => this.flipSel("x")), a(F.flipY, "FY", "Flip Y", () => this.flipSel("y")),
      a(F.cw, "CW", "Rot CW", () => this.rotateSel(90)), a(F.ccw, "CCW", "Rot CCW", () => this.rotateSel(-90)),
      a(F.cw45, "45", "Rot 45 CW", () => this.rotateSel(45)), a(F.ccw45, "-45", "Rot 45 CCW", () => this.rotateSel(-45)),
      a(F.rotFree, "Rot", "Rotate", () => { this.widget = this.widget === "rotate" ? null : "rotate"; this.toggles.rotate = this.widget === "rotate"; this.renderToggles(); this.redraw(); }),
      a(F.scale, "Scl", "Scale", () => { this.widget = this.widget === "scale" ? null : "scale"; this.redraw(); }),
      a(F.warp, "Wrp", "Warp", () => { this.widget = this.widget === "warp" ? null : "warp"; this.redraw(); }),
      a(F.scaleXY, "S+", "Scale +", () => this.scaleBy(1.25)),
      a(F.scaleXY, "S-", "Scale -", () => this.scaleBy(0.8), "scale(0.7)"),
      a(F.hsv, "Z", "Z Layer", () => this.editGroupPopup()),
    ];
  }

  deleteItems() {
    return [
      h("div", { class: "gd-capbtn" }, this.sqSprite(F.delBig, "Delete", () => this.deleteSelected(), { title: "Delete selected", inner: 30, size: 46 }), this.label("Delete", 10)),
      this.tbtn("Delete Start Pos", () => this.removeObjects(this.level.objects.filter((o) => o.id === 31)), { size: 12, cls: "ge-big" }),
      this.tbtn("Delete all of ID", () => {
        const ids = new Set(this.sel().map((o) => o.id));
        if (!ids.size) ids.add(this.current);
        const list = this.level.objects.filter((o) => ids.has(o.id));
        if (list.length && confirm(`Delete all ${list.length} objects with ID ${[...ids].join(", ")}?`)) this.removeObjects(list);
      }, { size: 12, cls: "ge-big" }),
      h("div", { class: "ge-hint" }, this.label(this.toggles.swipe ? "Swipe on: drag to delete" : "Tap an object to delete it", 12)),
    ];
  }

  // ================= loop / input =================
  loop() {
    const frame = () => {
      if (this.needsDraw) {
        this.needsDraw = false;
        try {
          const lf = this.layerFilter;
          this.renderer.draw({ editor: true, selection: this.selection, extraDraw: (ctx) => this.drawOverlay(ctx), hidden: lf === null ? null : (o) => (o.layer || 0) !== lf });
        } catch (e) { console.error(e); }
        const sel = this.selection.size;
        this.infoEl.replaceChildren(...[
          this.label(`Objects: ${this.level.objects.length}`, 13),
          sel ? this.label(`Selected: ${sel}`, 13) : null,
          this.readOnly ? this.label("View only", 13) : null].filter(Boolean));
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
  redraw() { this.needsDraw = true; }

  selCenter() {
    const objs = this.sel();
    if (!objs.length) return null;
    return [objs.reduce((a, o) => a + o.x, 0) / objs.length, objs.reduce((a, o) => a + o.y, 0) / objs.length];
  }

  gizmoHandles() {
    if (!this.widget || !this.selection.size || this.mode === "delete") return null;
    const c = this.selCenter();
    const r = 60 / this.renderer.cam.zoom;
    const objs = this.sel();
    if (this.widget === "rotate") {
      const a = ((-(objs[0].rot || 0)) * Math.PI) / 180 + Math.PI / 2;
      return { c, r, handles: [{ k: "rot", x: c[0] + Math.cos(a) * r, y: c[1] + Math.sin(a) * r }] };
    }
    if (this.widget === "scale") return { c, r, handles: [{ k: "scale", x: c[0] + r * 0.72, y: c[1] + r * 0.72 }] };
    return { c, r, handles: [{ k: "wx", x: c[0] + r, y: c[1] }, { k: "wy", x: c[0], y: c[1] + r }] };
  }

  drawOverlay(ctx) {
    const z = this.renderer.cam.zoom;
    if (this.box) {
      const [x1, y1, x2, y2] = this.box;
      ctx.fillStyle = "rgba(0,255,0,0.12)"; ctx.strokeStyle = "rgba(0,255,0,0.8)"; ctx.lineWidth = 1 / z;
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    }
    const g = this.gizmoHandles();
    if (g) {
      ctx.lineWidth = 2.5 / z;
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.beginPath(); ctx.arc(g.c[0], g.c[1], g.r, 0, Math.PI * 2); ctx.stroke();
      for (const hd of g.handles) {
        ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 2.5 / z;
        ctx.beginPath(); ctx.moveTo(g.c[0], g.c[1]); ctx.lineTo(hd.x, hd.y); ctx.stroke();
        ctx.fillStyle = hd.k === "wy" ? "#00ffff" : "#7dff00";
        ctx.beginPath(); ctx.arc(hd.x, hd.y, 8 / z, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#000"; ctx.lineWidth = 2 / z; ctx.stroke();
      }
    }
  }

  bind() {
    const c = this.canvas;
    const pointers = new Map();
    let drag = null;
    const visible = (o) => this.layerFilter === null || (o.layer || 0) === this.layerFilter;
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (pointers.size === 2) { drag = { type: "pinch", d: this.pinchDist(pointers), cam: { ...this.renderer.cam } }; return; }
      const [wx, wy] = this.renderer.screenToWorld(e.offsetX, e.offsetY);
      if (e.button === 1 || e.button === 2 || this.space) { drag = { type: "pan", sx: e.offsetX, sy: e.offsetY, cam: { ...this.renderer.cam } }; return; }
      const g = this.gizmoHandles();
      if (g && !this.readOnly) {
        const hit = g.handles.find((hd) => Math.hypot(hd.x - wx, hd.y - wy) * this.renderer.cam.zoom < 16);
        if (hit) {
          const objs = this.sel();
          drag = { type: "gizmo", k: hit.k, c: g.c, objs, start: objs.map((o) => o.snapshot()), a0: Math.atan2(wy - g.c[1], wx - g.c[0]), d0: Math.max(1, Math.hypot(wx - g.c[0], wy - g.c[1])), x0: Math.max(1, Math.abs(wx - g.c[0])), y0: Math.max(1, Math.abs(wy - g.c[1])) };
          return;
        }
      }
      if (this.mode === "build") {
        if (this.toggles.swipe) { drag = { type: "paint" }; this.placeAt(wx, wy, true); }
        else drag = { type: "tap", sx: e.offsetX, sy: e.offsetY, cam: { ...this.renderer.cam }, wx, wy };
      } else if (this.mode === "delete") {
        if (this.toggles.swipe) {
          drag = { type: "erase" };
          const o = this.renderer.objectAt(wx, wy, visible);
          if (o) this.removeObjects([o]);
        } else drag = { type: "tapdel", sx: e.offsetX, sy: e.offsetY, cam: { ...this.renderer.cam }, wx, wy };
      } else {
        const o = this.renderer.objectAt(wx, wy, visible);
        if (o && this.selection.has(o) && this.toggles.freeMove && !e.shiftKey) drag = { type: "move", wx, wy, start: [...this.selection].map((s) => [s, s.x, s.y]), moved: false };
        else if (this.toggles.swipe || e.shiftKey) { drag = { type: "box", wx, wy, add: e.shiftKey }; this.box = [wx, wy, wx, wy]; }
        else drag = { type: "tapsel", sx: e.offsetX, sy: e.offsetY, cam: { ...this.renderer.cam }, wx, wy, o };
      }
    });
    c.addEventListener("pointermove", (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (!drag) return;
      const [wx, wy] = this.renderer.screenToWorld(e.offsetX, e.offsetY);
      const cam = this.renderer.cam;
      if (drag.type === "pinch" && pointers.size === 2) {
        cam.zoom = Math.max(0.15, Math.min(6, drag.cam.zoom * (this.pinchDist(pointers) / drag.d)));
        this.redraw();
      } else if (["pan", "tap", "tapdel"].includes(drag.type) || (drag.type === "tapsel" && (!drag.o || !this.toggles.freeMove))) {
        const dx = e.offsetX - drag.sx, dy = e.offsetY - drag.sy;
        if (drag.type !== "pan" && Math.hypot(dx, dy) < 6) return;
        drag.type = "pan";
        cam.x = drag.cam.x - dx / cam.zoom; cam.y = drag.cam.y + dy / cam.zoom;
        this.redraw();
      } else if (drag.type === "tapsel" && drag.o) {
        if (Math.hypot(e.offsetX - drag.sx, e.offsetY - drag.sy) < 6) return;
        if (!this.selection.has(drag.o)) this.select([drag.o]);
        drag = { type: "move", wx: drag.wx, wy: drag.wy, start: [...this.selection].map((s) => [s, s.x, s.y]), moved: false };
      } else if (drag.type === "paint") this.placeAt(wx, wy, true);
      else if (drag.type === "erase") { const o = this.renderer.objectAt(wx, wy, visible); if (o) this.removeObjects([o]); }
      else if (drag.type === "box") { this.box[2] = wx; this.box[3] = wy; this.redraw(); }
      else if (drag.type === "move") {
        if (this.readOnly) return;
        let dx = wx - drag.wx, dy = wy - drag.wy;
        if (this.toggles.snap && !e.altKey) { dx = Math.round(dx / GRID) * GRID; dy = Math.round(dy / GRID) * GRID; }
        if (!drag.moved) { drag.before = drag.start.map(([o]) => o.snapshot()); drag.moved = true; }
        for (const [o, x, y] of drag.start) { o.x = x + dx; o.y = y + dy; }
        this.markDirty();
      } else if (drag.type === "gizmo") {
        const [cx, cy] = drag.c;
        drag.objs.forEach((o, i) => o.restore(drag.start[i]));
        if (drag.k === "rot") {
          let deg = -((Math.atan2(wy - cy, wx - cx) - drag.a0) * 180) / Math.PI;
          if (this.toggles.snap && !e.altKey) deg = Math.round(deg / 5) * 5;
          this.applyRotate(drag.objs, deg, cx, cy);
        } else if (drag.k === "scale") {
          let s = Math.hypot(wx - cx, wy - cy) / drag.d0;
          if (this.toggles.snap && !e.altKey) s = Math.round(s * 20) / 20;
          for (const o of drag.objs) {
            o.sx = Math.max(0.05, o.sx * s); o.sy = Math.max(0.05, o.sy * s);
            if (drag.objs.length > 1) { o.x = cx + (o.x - cx) * s; o.y = cy + (o.y - cy) * s; }
          }
        } else {
          const ax = drag.k === "wx";
          let s = ax ? Math.abs(wx - cx) / drag.x0 : Math.abs(wy - cy) / drag.y0;
          if (this.toggles.snap && !e.altKey) s = Math.round(s * 20) / 20;
          for (const o of drag.objs) { if (ax) o.sx = Math.max(0.05, o.sx * s); else o.sy = Math.max(0.05, o.sy * s); }
        }
        this.markDirty();
      }
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (!drag) return;
      if (drag.type === "tap") this.placeAt(drag.wx, drag.wy, false);
      else if (drag.type === "tapdel") { const o = this.renderer.objectAt(drag.wx, drag.wy, visible); if (o) this.removeObjects([o]); }
      else if (drag.type === "tapsel") {
        if (drag.o) this.select(e.shiftKey || e.ctrlKey || e.metaKey ? [...this.selection, drag.o] : [drag.o]);
        else this.select([]);
      } else if (drag.type === "box") {
        const [x1, y1, x2, y2] = this.box;
        const found = this.renderer.objectsInRect(x1, y1, x2, y2).filter(visible);
        this.select(drag.add ? [...this.selection, ...found] : found);
        this.box = null;
      } else if (drag.type === "move" && drag.moved) {
        const objs = drag.start.map(([o]) => o);
        this.pushHistory({ type: "modify", objs, before: drag.before, after: objs.map((o) => o.snapshot()) });
      } else if (drag.type === "gizmo") {
        this.pushHistory({ type: "modify", objs: drag.objs, before: drag.start, after: drag.objs.map((o) => o.snapshot()) });
      }
      if (pointers.size === 0) drag = null;
      this.redraw();
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const cam = this.renderer.cam;
      if (e.ctrlKey || e.metaKey) {
        const [wx, wy] = this.renderer.screenToWorld(e.offsetX, e.offsetY);
        cam.zoom = Math.max(0.15, Math.min(6, cam.zoom * Math.exp(-e.deltaY * 0.002)));
        const [nx, ny] = this.renderer.screenToWorld(e.offsetX, e.offsetY);
        cam.x += wx - nx; cam.y += wy - ny;
      } else if (e.shiftKey) cam.x += e.deltaY / cam.zoom;
      else { cam.x += e.deltaX / cam.zoom; cam.y -= e.deltaY / cam.zoom; }
      this.redraw();
    }, { passive: false });

    this.onKey = (e) => {
      if (e.target.closest?.("input, textarea, select") || document.querySelector(".modal-bg")) return;
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.type === "keyup") { if (k === " ") this.space = false; return; }
      if (k === " ") { this.space = true; e.preventDefault(); return; }
      if (ctrl && k === "z") { e.preventDefault(); return e.shiftKey ? this.redo() : this.undo(); }
      if (ctrl && k === "y") { e.preventDefault(); return this.redo(); }
      if (ctrl && k === "c") return this.copy();
      if (ctrl && k === "v") return this.paste();
      if (ctrl && k === "d") { e.preventDefault(); this.copy(); return this.paste(); }
      if (ctrl && k === "a") { e.preventDefault(); return this.select(this.level.objects); }
      if (ctrl && k === "s") { e.preventDefault(); return this.save(); }
      if (ctrl) return;
      if (k === "1") return this.setMode("build");
      if (k === "2") return this.setMode("edit");
      if (k === "3") return this.setMode("delete");
      if (k === "delete" || k === "backspace") return this.deleteSelected();
      if (k === "escape") return this.pausePopup();
      if (k === "t") return this.toggle("swipe");
      if (k === "r") return this.toggle("rotate");
      if (k === "f") return this.toggle("freeMove");
      if (k === "g") return this.toggle("snap");
      const step = e.shiftKey ? 2 : e.altKey ? 150 : 30;
      if (this.selection.size) {
        if (k === "w") return this.moveSel(0, step);
        if (k === "s") return this.moveSel(0, -step);
        if (k === "a") return this.moveSel(-step, 0);
        if (k === "d") return this.moveSel(step, 0);
        if (k === "q") return this.rotateSel(e.shiftKey ? -45 : -90);
        if (k === "e") return this.rotateSel(e.shiftKey ? 45 : 90);
      }
      const cam = this.renderer.cam;
      if (k === "arrowleft") { cam.x -= 180 / cam.zoom; this.redraw(); }
      if (k === "arrowright") { cam.x += 180 / cam.zoom; this.redraw(); }
      if (k === "arrowup") { cam.y += 120 / cam.zoom; this.redraw(); }
      if (k === "arrowdown") { cam.y -= 120 / cam.zoom; this.redraw(); }
    };
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    this.onResize = () => { this.renderer.resize(); this.renderPage(); this.redraw(); };
    window.addEventListener("resize", this.onResize);
  }

  pinchDist(p) { const [a, b] = [...p.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1; }
  zoom(f) { this.renderer.cam.zoom = Math.max(0.15, Math.min(6, this.renderer.cam.zoom * f)); this.redraw(); }

  // ================= editing =================
  guard() {
    if (this.readOnly) { toast("View only — this level can't be edited"); return false; }
    return true;
  }
  markDirty() { this.dirty = true; this.renderer.dirty = true; this.redraw(); }

  pushHistory(entry) {
    this.history.push(entry);
    if (this.history.length > 300) this.history.shift();
    this.future = [];
    this.markDirty();
  }

  applyEntry(e, dir) {
    if (e.type === "add" || e.type === "remove") {
      const adding = (e.type === "add") === (dir === "redo");
      if (adding) this.level.objects.push(...e.objs);
      else { const s = new Set(e.objs); this.level.objects = this.level.objects.filter((o) => !s.has(o)); for (const o of e.objs) this.selection.delete(o); }
    } else if (e.type === "modify") e.objs.forEach((o, i) => o.restore(dir === "undo" ? e.before[i] : e.after[i]));
    this.markDirty();
  }
  undo() { const e = this.history.pop(); if (!e) return; this.applyEntry(e, "undo"); this.future.push(e); }
  redo() { const e = this.future.pop(); if (!e) return; this.applyEntry(e, "redo"); this.history.push(e); }

  addObjects(list) {
    if (!this.guard() || !list.length) return;
    this.level.objects.push(...list);
    this.pushHistory({ type: "add", objs: list });
  }
  removeObjects(list) {
    if (!this.guard() || !list.length) return;
    const s = new Set(list);
    this.level.objects = this.level.objects.filter((o) => !s.has(o));
    list.forEach((o) => this.selection.delete(o));
    this.pushHistory({ type: "remove", objs: list });
  }
  modify(objs, fn) {
    if (!this.guard() || !objs.length) return;
    const before = objs.map((o) => o.snapshot());
    objs.forEach(fn);
    this.pushHistory({ type: "modify", objs, before, after: objs.map((o) => o.snapshot()) });
  }

  placeAt(wx, wy, painting) {
    if (!this.guard()) return;
    const x = snap(wx), y = snap(wy);
    if (this.level.objects.some((o) => o.id === this.current && o.x === x && o.y === y)) return;
    const o = new GDObject(this.current, x, y);
    if (this.layerFilter !== null) o.layer = this.layerFilter;
    const d = this.db.get(this.current);
    if (d?.cat === "trigger") {
      if (this.current === 899) { o.set("7", 255); o.set("8", 255); o.set("9", 255); o.set("10", "0.5"); o.set("23", 1); }
      if (LEGACY_COLOR_TARGET[this.current]) { o.set("7", 255); o.set("8", 255); o.set("9", 255); o.set("10", "0.5"); }
      if (this.current === 901 || this.current === 1346) o.set("10", "0.5");
      if (this.current === 1007) { o.set("10", "0.5"); o.set("35", 1); }
    }
    if (this.current === 31) { o.set("kA2", 0); o.set("kA4", 0); }
    this.addObjects([o]);
    if (!painting) this.select([o]); else this.selection = new Set([o]);
  }

  select(list) { this.selection = new Set(list); this.redraw(); }
  sel() { return [...this.selection]; }
  deleteSelected() { this.removeObjects(this.sel()); }
  moveSel(dx, dy) { this.modify(this.sel(), (o) => { o.x += dx; o.y += dy; }); }
  flipSel(axis) {
    const objs = this.sel();
    if (!objs.length) return;
    const [cx, cy] = this.selCenter();
    this.modify(objs, (o) => {
      if (axis === "x") { o.flipX = !o.flipX; o.x = 2 * cx - o.x; o.rot = -o.rot; }
      else { o.flipY = !o.flipY; o.y = 2 * cy - o.y; o.rot = -o.rot; }
    });
  }
  applyRotate(objs, deg, cx, cy) {
    const a = (-deg * Math.PI) / 180;
    for (const o of objs) {
      if (objs.length > 1) { const x = o.x - cx, y = o.y - cy; o.x = cx + x * Math.cos(a) - y * Math.sin(a); o.y = cy + x * Math.sin(a) + y * Math.cos(a); }
      o.rot = ((o.rot + deg + 540) % 360) - 180;
    }
  }
  rotateSel(deg) {
    const objs = this.sel();
    if (!objs.length || !this.guard()) return;
    const [cx, cy] = this.selCenter();
    const before = objs.map((o) => o.snapshot());
    this.applyRotate(objs, deg, cx, cy);
    this.pushHistory({ type: "modify", objs, before, after: objs.map((o) => o.snapshot()) });
  }
  scaleBy(f) { this.modify(this.sel(), (o) => { o.sx = Math.round(o.sx * f * 100) / 100; o.sy = Math.round(o.sy * f * 100) / 100; }); }

  copy() {
    const objs = this.sel();
    if (!objs.length) return toast("Nothing selected");
    this.clipboard = objs.map((o) => o.clone());
  }
  paste() {
    if (!this.clipboard.length) return toast("Nothing to paste");
    const list = this.clipboard.map((o) => o.clone());
    this.addObjects(list);
    this.select(list);
  }

  // ================= GD-style popups =================
  popup(titleStr, body, actions = []) {
    let close;
    const p = panel("", h("div", { class: "center" }, text(titleStr, { font: "goldFont", size: 30, align: "center" })), body,
      h("div", { class: "row center", style: { marginTop: "14px" } }, ...actions, btn("OK", () => close(), { small: true })));
    close = modal(p, { onClose: () => this.redraw() });
    return close;
  }
  field(label, input) { return h("label", { class: "ed-field" }, text(label, { font: "bigFont", size: 15 }), input); }

  editObjectPopup() {
    const objs = this.sel();
    if (!objs.length) return toast("Select objects first");
    let slot = "col1";
    const body = h("div", { class: "col" });
    const render = () => {
      const o = objs[0];
      const d = this.db.get(o.id);
      const current = o[slot] ?? null;
      const hsvKey = slot === "col1" ? ["41", "43"] : ["42", "44"];
      const curHsv = String(o.props[hsvKey[1]] || "0a1a1a0a0").split("a");
      const hsvIn = (i, step, title) => h("input", { class: "gd-input", type: "number", step, value: curHsv[i] ?? (i ? 1 : 0), title, style: { width: "86px" }, onchange: (e) => {
        curHsv[i] = e.target.value;
        this.modify(objs, (x) => { x.set(hsvKey[0], true); x.set(hsvKey[1], `${curHsv[0]}a${curHsv[1]}a${curHsv[2]}a${curHsv[3] || 0}a${curHsv[4] || 0}`); });
      } });
      body.replaceChildren(
        h("div", { class: "row center" }, btn("Base", () => { slot = "col1"; render(); }, { small: true, color: slot === "col1" ? "" : "grey" }), btn("Detail", () => { slot = "col2"; render(); }, { small: true, color: slot === "col2" ? "" : "grey" })),
        h("div", { class: "swatches", style: { gridTemplateColumns: "repeat(auto-fill, minmax(46px, 1fr))" } }, CHANNEL_QUICK.map(([l, ch]) => {
          const rgb = ch === null ? this.renderer.channel(slot === "col1" ? d?.col1 ?? 1004 : 0).rgb : this.renderer.channel(ch).rgb;
          return h("button", { class: current === ch ? "sel" : "", "data-tag": "", title: ch === null ? "Default" : `Channel ${ch}`, style: { background: `rgb(${rgb})`, aspectRatio: "auto", height: "40px", color: "#fff" },
            onclick: () => { this.modify(objs, (x) => { x[slot] = ch; }); render(); } }, h("span", { class: "small", style: { textShadow: "0 0 3px #000, 0 0 3px #000", fontWeight: "bold" } }, l));
        })),
        this.field("Channel ID", h("input", { class: "gd-input", type: "number", min: 0, max: 1101, value: current ?? "", placeholder: "default", onchange: (e) => { this.modify(objs, (x) => { x[slot] = e.target.value === "" ? null : +e.target.value; }); render(); } })),
        this.field("HSV", h("div", { class: "row" }, hsvIn(0, 1, "Hue"), hsvIn(1, 0.05, "Saturation"), hsvIn(2, 0.05, "Brightness"))),
        h("div", { class: "row center" }, btn("Edit Channel Color", () => this.colorsPopup(current ?? 1), { small: true, color: "cyan" })));
    };
    render();
    this.popup("Edit Object", body);
  }

  editGroupPopup() {
    const objs = this.sel();
    if (!objs.length) return toast("Select objects first");
    const o = objs[0];
    const d = this.db.get(o.id);
    const groupsEl = h("div", { class: "row center" });
    const renderGroups = () => {
      const all = [...new Set(objs.flatMap((x) => x.groups))].sort((a, b) => a - b);
      groupsEl.replaceChildren(...all.map((g) => btn(`${g}  x`, () => { this.modify(objs, (x) => { x.groups = x.groups.filter((y) => y !== g); }); renderGroups(); }, { small: true, color: "grey" })));
      if (!all.length) groupsEl.append(h("span", { class: "small muted" }, "No groups"));
    };
    renderGroups();
    const gIn = h("input", { class: "gd-input", type: "number", min: 1, max: 9999, placeholder: "Group ID", style: { width: "130px" } });
    const nextFree = () => { const used = new Set(this.level.objects.flatMap((x) => x.groups)); let i = 1; while (used.has(i)) i++; return i; };
    const layerRow = h("div", { class: "row center" });
    const renderLayers = () => {
      const cur = o.zLayer ?? d?.zLayer ?? 5;
      layerRow.replaceChildren(...LAYERS.map(([n, v]) => btn(n, () => { this.modify(objs, (x) => { x.zLayer = v; }); renderLayers(); }, { small: true, color: cur === v ? "" : "grey" })));
    };
    renderLayers();
    const zo = h("input", { class: "gd-input", type: "number", value: o.zOrder ?? "", placeholder: String(d?.zOrder ?? 0), style: { width: "100px" }, onchange: (e) => this.modify(objs, (x) => { x.zOrder = e.target.value === "" ? null : +e.target.value; }) });
    const el = h("input", { class: "gd-input", type: "number", value: o.layer || 0, style: { width: "100px" }, onchange: (e) => this.modify(objs, (x) => { x.layer = +e.target.value || 0; }) });
    this.popup("Edit Group", h("div", { class: "col" },
      h("div", { class: "row center" }, gIn,
        btn("Add", () => { const g = +gIn.value; if (!g) return; this.modify(objs, (x) => { if (!x.groups.includes(g)) x.groups.push(g); }); renderGroups(); }, { small: true }),
        btn("Next Free", () => { gIn.value = nextFree(); }, { small: true, color: "grey" })),
      groupsEl,
      h("div", { class: "center" }, text("Z Layer", { font: "goldFont", size: 20 })), layerRow,
      this.field("Z Order", zo), this.field("Editor Layer", el)));
  }

  specialPopup() {
    const objs = this.sel();
    if (objs.length !== 1) return toast("Select one trigger, start position or text object");
    const o = objs[0];
    if (o.id === 914) {
      let cur = "";
      try { cur = decodeURIComponent(escape(atob((o.props["31"] || "").replace(/-/g, "+").replace(/_/g, "/")))); } catch { cur = ""; }
      const t = h("input", { class: "gd-input", value: cur });
      return this.popup("Text", t, [btn("Apply", () => this.modify([o], (x) => x.set("31", btoa(unescape(encodeURIComponent(t.value))).replace(/\+/g, "-").replace(/\//g, "_"))), { small: true })]);
    }
    const fields = o.id === 31 ? START_POS_FIELDS : TRIGGER_FIELDS[o.id];
    if (!fields) return this.rawPopup(o);
    const body = h("div", { class: "col" });
    for (const [key, label, type, def] of fields) {
      let input;
      const val = o.props[key];
      const set = (v) => this.modify([o], (x) => x.set(key, v));
      if (type === "bool") input = h("input", { type: "checkbox", checked: val === "1", onchange: (e) => set(e.target.checked) });
      else if (type === "rgb") input = h("input", { type: "color", value: rgbHex(o.num("7", 255), o.num("8", 255), o.num("9", 255)), onchange: (e) => { const [r, g, b] = hexRgb(e.target.value); this.modify([o], (x) => { x.set("7", r); x.set("8", g); x.set("9", b); }); } });
      else if (type === "easing") input = h("select", { class: "gd-input", onchange: (e) => set(e.target.value === "0" ? null : e.target.value) }, ...EASINGS.map((n, i) => h("option", { value: i, selected: +(val || 0) === i }, n)));
      else if (type === "gamemode") input = h("select", { class: "gd-input", onchange: (e) => set(e.target.value) }, ...GAMEMODES.map((n, i) => h("option", { value: i, selected: +(val || 0) === i }, n)));
      else if (type === "speed") input = h("select", { class: "gd-input", onchange: (e) => set(e.target.value) }, ...SPEEDS.map(([n, v]) => h("option", { value: v, selected: +(val || 0) === v }, n)));
      else input = h("input", { class: "gd-input", type: "number", step: type === "num" ? "any" : 1, value: val ?? "", placeholder: def !== undefined ? String(def) : "", onchange: (e) => set(e.target.value) });
      body.append(this.field(label, input));
    }
    this.popup(o.id === 31 ? "Start Position" : TRIGGER_NAMES[o.id] || `Object ${o.id}`, body, [btn("Raw", () => this.rawPopup(o), { small: true, color: "grey" })]);
  }

  rawPopup(o) {
    const ta = h("textarea", { class: "gd-input", style: { width: "100%", minHeight: "160px", fontFamily: "monospace" } }, Object.entries(o.props).map(([k, v]) => `${k},${v}`).join("\n"));
    this.popup(`Object ${o.id}`, h("div", { class: "col" }, h("div", { class: "small muted" }, "One key,value per line (position, rotation, groups and colors are edited elsewhere)."), ta),
      [btn("Apply", () => this.modify([o], (x) => {
        x.props = {};
        for (const line of ta.value.split("\n")) { const i = line.indexOf(","); if (i > 0) x.props[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
      }), { small: true })]);
  }

  colorsPopup(startId = 1000) {
    let id = startId || 1000;
    const body = h("div", { class: "col" });
    const render = () => {
      const c = this.level.colors.get(id) || { r: 255, g: 255, b: 255, player: -1, blend: false, opacity: 1 };
      const cur = this.renderer.channel(id).rgb;
      const update = (patch) => { if (!this.guard()) return; this.level.colors.set(id, { ...c, ...patch }); this.markDirty(); render(); };
      body.replaceChildren(
        h("div", { class: "row center" }, ...[1000, 1001, 1009, 1013, 1002, 1003, 1004, 1007].map((ch) => btn(SPECIAL_CHANNELS[ch], () => { id = ch; render(); }, { small: true, color: ch === id ? "" : "grey" }))),
        this.field("Channel ID", h("input", { class: "gd-input", type: "number", min: 1, max: 1014, value: id, onchange: (e) => { id = +e.target.value || 1; render(); } })),
        this.field("Color", h("input", { type: "color", value: rgbHex(...cur), onchange: (e) => { const [r, g, b] = hexRgb(e.target.value); update({ r, g, b, player: -1 }); } })),
        this.field("Opacity", h("input", { type: "range", min: 0, max: 1, step: 0.01, value: c.opacity ?? 1, onchange: (e) => update({ opacity: +e.target.value }) })),
        this.field("Blending", h("input", { type: "checkbox", checked: !!c.blend, onchange: (e) => update({ blend: e.target.checked }) })),
        this.field("Player color", h("select", { class: "gd-input", onchange: (e) => update({ player: +e.target.value }) }, ...[["-1", "None"], ["1", "P1"], ["2", "P2"]].map(([v, l]) => h("option", { value: v, selected: String(c.player ?? -1) === v }, l)))),
        this.field("Copy channel", h("input", { class: "gd-input", type: "number", value: c.copy || "", placeholder: "none", onchange: (e) => update({ copy: +e.target.value || 0 }) })));
    };
    render();
    this.popup("Color Channel", body);
  }

  settingsPopup() {
    const hd = this.level.header;
    const set = (k, v) => { if (!this.guard()) return; hd[k] = String(v); this.markDirty(); if (k === "kA6" || k === "kA7") this.renderer.loadBackgrounds(); };
    const sel = (k, opts) => h("select", { class: "gd-input", onchange: (e) => set(k, e.target.value) }, ...opts.map(([l, v]) => h("option", { value: v, selected: String(hd[k] ?? "0") === String(v) }, l)));
    const chk = (k) => h("input", { type: "checkbox", checked: hd[k] === "1", onchange: (e) => set(k, e.target.checked ? 1 : 0) });
    const m = this.meta;
    let close = null;
    close = this.popup("Level Settings", h("div", { class: "col" },
      h("div", { class: "row center" },
        ...[["BG", 1000], ["G1", 1001], ["G2", 1009], ["Line", 1002], ["Obj", 1004], ["3DL", 1003]].map(([l, ch]) => btn(l, () => { close?.(); this.colorsPopup(ch); }, { small: true, color: "cyan" }))),
      this.field("Start mode", sel("kA2", GAMEMODES.map((n, i) => [n, i]))),
      this.field("Speed", sel("kA4", SPEEDS)),
      this.field("Mini", chk("kA3")), this.field("Dual", chk("kA8")), this.field("2-Player", chk("kA10")), this.field("Platformer", chk("kA22")),
      this.field("Background", h("input", { class: "gd-input", type: "number", min: 0, max: 59, value: hd.kA6 || 0, onchange: (e) => set("kA6", e.target.value) })),
      this.field("Ground", h("input", { class: "gd-input", type: "number", min: 0, max: 22, value: hd.kA7 || 0, onchange: (e) => set("kA7", e.target.value) })),
      this.field("Song", h("select", { class: "gd-input", onchange: (e) => { m.officialSong = +e.target.value; m.songID = 0; this.dirty = true; } }, ...OFFICIAL_SONGS.map((n, i) => h("option", { value: i, selected: (m.officialSong || 0) === i && !m.songID }, n)))),
      this.field("Custom Song ID", h("input", { class: "gd-input", type: "number", value: m.songID || "", placeholder: "none", onchange: (e) => { m.songID = +e.target.value || 0; this.dirty = true; } })),
      this.field("Song Offset", h("input", { class: "gd-input", type: "number", step: "any", value: hd.kA13 || 0, onchange: (e) => set("kA13", e.target.value) }))));
  }

  pausePopup() {
    if (document.querySelector(".modal-bg")) return;
    let close;
    const b = (label, fn, color) => btn(label, () => { close(); fn(); }, { color });
    const ro = this.readOnly;
    const m = this.meta;
    const p = panel("", h("div", { class: "center" }, text(m.name || "Unnamed", { font: "bigFont", size: 34, align: "center" })),
      h("div", { class: "col", style: { alignItems: "center" } },
        b("Resume", () => {}),
        ro ? null : b("Save", () => this.save()),
        ro ? null : b("Save and Exit", async () => { if (await this.save()) this.onExit?.(); }),
        b("Exit", () => { if (!this.dirty || ro || confirm("Exit without saving?")) this.onExit?.(); }, "grey"),
        ro ? null : h("div", { class: "row center" },
          btn("Level Info", () => { close(); this.infoPopup(); }, { small: true, color: "cyan" }),
          btn("Export .gmd", () => { close(); this.onExport?.("gmd"); }, { small: true, color: "cyan" }),
          btn("Copy String", () => { close(); this.onExport?.("string"); }, { small: true, color: "cyan" }),
          btn("Upload", () => { close(); this.onUpload?.(); }, { small: true, color: "cyan" })),
        h("div", { class: "small muted center", style: { maxWidth: "460px" } }, "Keys: 1/2/3 Build/Edit/Delete · T Swipe · R Rotate · F Free Move · G Snap · WASD move (Shift small, Alt big) · Q/E rotate · Ctrl+C/V/D · Ctrl+Z/Y · Ctrl+S save · Space/right-drag pan · Ctrl+wheel zoom")));
    close = modal(p);
  }

  infoPopup() {
    const m = this.meta;
    this.popup("Level Info", h("div", { class: "col" },
      this.field("Name", h("input", { class: "gd-input", value: m.name || "", maxlength: 20, onchange: (e) => { m.name = e.target.value; this.dirty = true; } })),
      this.field("Description", h("textarea", { class: "gd-input", maxlength: 180, onchange: (e) => { m.description = e.target.value; this.dirty = true; } }, m.description || ""))));
  }

  async save() {
    if (this.readOnly) return false;
    try {
      await this.onSave?.(this.level.serialize(), this.meta);
      this.dirty = false;
      this.redraw();
      toast("Level saved!", "ok");
      return true;
    } catch (e) { toast(e.message, "error"); return false; }
  }
}
