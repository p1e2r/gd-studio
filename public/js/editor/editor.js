// GD-style level editor (build / edit / delete), no playtest.
import { h, toast } from "../core.js";
import { gameAtlas, text, sprite } from "../gd.js";
import { loadDb, TABS, TRIGGER_FIELDS, TRIGGER_NAMES, START_POS_FIELDS, EASINGS, LEGACY_COLOR_TARGET } from "./objdb.js";
import { Renderer } from "./render.js";
import { GDObject, SPECIAL_CHANNELS, GAMEMODES, SPEEDS } from "./level.js";
import { panel, btn, modal } from "../ui.js";
import { OFFICIAL_SONGS } from "../ui.js";

const GRID = 30;
const snap = (v) => Math.floor(v / GRID) * GRID + GRID / 2;
const rgbHex = (r, g, b) => `#${[r, g, b].map((v) => (+v).toString(16).padStart(2, "0")).join("")}`;
const hexRgb = (hx) => [1, 3, 5].map((i) => parseInt(hx.slice(i, i + 2), 16));

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
    this.swipe = false;
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
    const z = Math.max(0.8, this.renderer.H / 420);
    // put the ground line just above the bottom toolbar
    this.renderer.cam = { x: this.renderer.W / 2 / z - 90, y: (this.renderer.H / 2 - 250) / z, zoom: z };
    this.bind();
    this.loop();
    if (!Object.keys(atlas.frames).length) toast("GD sprite sheets not found — objects show as placeholders. See Setup.", "error");
    if (this.readOnly) toast("View only: the creator hasn't allowed copying this level.");
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("resize", this.onResize);
    document.body.classList.remove("fullscreen");
  }

  // ---------------- DOM ----------------
  buildDom() {
    const iconBtn = (frame, label, fn, extra = {}) => {
      const b = h("button", { class: "ed-btn", title: label, onclick: fn, ...extra }, sprite(frame), h("span", { class: "lbl" }, label));
      return b;
    };
    this.modeBtns = {};
    const modeCol = h("div", { class: "ed-modes" }, ...[["build", "Build", "GJ_buildBtn_001.png"], ["edit", "Edit", "GJ_editBtn_001.png"], ["delete", "Delete", "GJ_deleteBtn_001.png"]].map(([m, l, f]) => {
      const b = iconBtn(f, l, () => this.setMode(m));
      this.modeBtns[m] = b;
      return b;
    }));
    this.tabsEl = h("div", { class: "ed-tabs" });
    this.gridEl = h("div", { class: "ed-grid" });
    this.editEl = h("div", { class: "ed-editgrid" });
    this.deleteEl = h("div", { class: "ed-deletebar" });
    const center = h("div", { class: "ed-center" }, this.tabsEl, h("div", { class: "ed-pagewrap" },
      h("button", { class: "ed-arrow", onclick: () => this.turnPage(-1) }, sprite("GJ_arrow_02_001.png"), h("span", { class: "lbl" }, "‹")),
      this.gridEl, this.editEl, this.deleteEl,
      h("button", { class: "ed-arrow right", onclick: () => this.turnPage(1) }, sprite("GJ_arrow_02_001.png"), h("span", { class: "lbl" }, "›"))));
    this.swipeBtn = h("button", { class: "ed-toggle", onclick: () => { this.swipe = !this.swipe; this.swipeBtn.classList.toggle("on", this.swipe); } }, "Swipe");
    const rightBottom = h("div", { class: "ed-side" }, this.swipeBtn,
      h("button", { class: "ed-toggle", onclick: () => this.zoom(1.25) }, "+"),
      h("button", { class: "ed-toggle", onclick: () => this.zoom(0.8) }, "−"));
    this.bottom = h("div", { class: "ed-bottom" }, modeCol, center, rightBottom);

    this.infoEl = h("div", { class: "ed-info" });
    const top = h("div", { class: "ed-top" },
      h("div", { class: "row" },
        iconBtn("GJ_undoBtn_001.png", "Undo", () => this.undo()),
        iconBtn("GJ_redoBtn_001.png", "Redo", () => this.redo()),
        iconBtn("GJ_trashBtn_001.png", "Delete", () => this.deleteSelected())),
      this.infoEl,
      h("div", { class: "row" },
        iconBtn("GJ_colorBtn_001.png", "Colors", () => this.colorsPopup()),
        iconBtn("GJ_optionsBtn02_001.png", "Settings", () => this.settingsPopup()),
        iconBtn("GJ_pauseEditorBtn_001.png", "Pause", () => this.pausePopup())));
    const right = h("div", { class: "ed-right" },
      iconBtn("GJ_copyBtn_001.png", "Copy", () => this.copy()),
      iconBtn("GJ_pasteBtn_001.png", "Paste", () => this.paste()),
      iconBtn("GJ_duplicateBtn_001.png", "Copy+Paste", () => { this.copy(); this.paste(); }),
      iconBtn("GJ_editObjBtn_001.png", "Edit Object", () => this.editObjectPopup()),
      iconBtn("GJ_editGroupBtn_001.png", "Edit Group", () => this.editGroupPopup()),
      iconBtn("GJ_editHSVBtn_001.png", "Edit Special", () => this.specialPopup()),
      iconBtn("GJ_deselectBtn_001.png", "Deselect", () => this.select([])));
    this.root.replaceChildren(h("div", { class: "ed-root" }, this.canvas, top, right, this.bottom));
    this.renderTabs();
    this.setMode("build");
  }

  setMode(m) {
    this.mode = m;
    for (const [k, b] of Object.entries(this.modeBtns)) b.classList.toggle("on", k === m);
    this.gridEl.style.display = m === "build" ? "" : "none";
    this.tabsEl.style.visibility = m === "build" ? "" : "hidden";
    this.editEl.style.display = m === "edit" ? "" : "none";
    this.deleteEl.style.display = m === "delete" ? "" : "none";
    if (m === "build") this.renderGrid();
    if (m === "edit") this.renderEditButtons();
    if (m === "delete") this.renderDeleteBar();
  }

  renderTabs() {
    this.tabsEl.replaceChildren(...TABS.map(([label, key]) => {
      const ids = this.db.byTab[key];
      const c = h("canvas", { width: 56, height: 56 });
      if (ids[0]) this.renderer.thumb(c, ids[0]);
      const b = h("button", { class: `ed-tab ${this.tab === key ? "on" : ""}`, title: label, onclick: () => { this.tab = key; this.page = 0; this.renderTabs(); this.renderGrid(); } }, c);
      return b;
    }));
  }

  perPage() {
    const w = this.gridEl.clientWidth || 600;
    const cols = Math.max(4, Math.floor(w / 62));
    return { cols, n: cols * 2 };
  }

  renderGrid() {
    const ids = this.db.byTab[this.tab] || [];
    const { cols, n } = this.perPage();
    const pages = Math.max(1, Math.ceil(ids.length / n));
    this.page = Math.max(0, Math.min(this.page, pages - 1));
    this.gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    this.gridEl.replaceChildren(...ids.slice(this.page * n, this.page * n + n).map((id) => {
      const c = h("canvas", { width: 96, height: 96 });
      this.renderer.thumb(c, id);
      const name = TRIGGER_NAMES[id] ? `${TRIGGER_NAMES[id]} (${id})` : `Object ${id}`;
      return h("button", { class: `ed-obj ${this.current === id ? "on" : ""}`, title: name, onclick: () => { this.current = id; this.renderGrid(); } }, c);
    }));
  }

  turnPage(d) {
    if (this.mode !== "build") return;
    this.page += d;
    this.renderGrid();
  }

  renderEditButtons() {
    const mv = (dx, dy, label) => h("button", { class: "ed-mini", onclick: () => this.moveSel(dx, dy) }, label);
    const act = (label, fn) => h("button", { class: "ed-mini", onclick: fn }, label);
    const scale = h("input", { type: "range", min: 0.1, max: 4, step: 0.05, value: 1, class: "ed-range", oninput: (e) => this.scaleSel(+e.target.value, true), onchange: (e) => this.scaleSel(+e.target.value) });
    const rot = h("input", { type: "range", min: -180, max: 180, step: 1, value: 0, class: "ed-range", oninput: (e) => this.rotateSelTo(+e.target.value, true), onchange: (e) => this.rotateSelTo(+e.target.value) });
    this.editEl.replaceChildren(
      mv(0, 30, "↑"), mv(0, -30, "↓"), mv(-30, 0, "←"), mv(30, 0, "→"),
      mv(0, 150, "⇈ 5"), mv(0, -150, "⇊ 5"), mv(-150, 0, "⇇ 5"), mv(150, 0, "⇉ 5"),
      mv(0, 2, "↑ s"), mv(0, -2, "↓ s"), mv(-2, 0, "← s"), mv(2, 0, "→ s"),
      mv(0, 15, "↑ ½"), mv(0, -15, "↓ ½"), mv(-15, 0, "← ½"), mv(15, 0, "→ ½"),
      act("Flip X", () => this.flipSel("x")), act("Flip Y", () => this.flipSel("y")),
      act("⟲ 90", () => this.rotateSel(-90)), act("⟳ 90", () => this.rotateSel(90)),
      act("⟲ 45", () => this.rotateSel(-45)), act("⟳ 45", () => this.rotateSel(45)),
      h("label", { class: "ed-slider" }, "Scale", scale),
      h("label", { class: "ed-slider" }, "Rotate", rot));
  }

  renderDeleteBar() {
    this.deleteEl.replaceChildren(
      btn("Delete Selected", () => this.deleteSelected(), { small: true, color: "red" }),
      btn("Delete all of selected IDs", () => {
        const ids = new Set([...this.selection].map((o) => o.id));
        if (!ids.size) return toast("Select an object first");
        this.removeObjects(this.level.objects.filter((o) => ids.has(o.id)));
      }, { small: true, color: "grey" }),
      h("span", { class: "small" }, "Tap objects to delete them. Swipe to delete many."));
  }

  // ---------------- loop / input ----------------
  loop() {
    const frame = () => {
      if (this.needsDraw) {
        this.needsDraw = false;
        try {
          this.renderer.draw({ editor: true, selection: this.selection, extraDraw: (ctx) => this.drawOverlay(ctx) });
        } catch (e) { console.error(e); }
        const sel = this.selection.size;
        this.infoEl.replaceChildren(text(`${this.meta.name || "Untitled"}${this.dirty ? " *" : ""}`, { font: "goldFont", size: 18 }),
          h("span", { class: "small" }, `${this.level.objects.length} objects${sel ? ` · ${sel} selected` : ""}${this.readOnly ? " · view only" : ""}`));
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
  redraw() { this.needsDraw = true; }

  drawOverlay(ctx) {
    if (this.box) {
      const [x1, y1, x2, y2] = this.box;
      ctx.fillStyle = "rgba(0,255,0,0.12)"; ctx.strokeStyle = "rgba(0,255,0,0.8)"; ctx.lineWidth = 1 / this.renderer.cam.zoom;
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    }
    if (this.hover && this.mode === "build") {
      ctx.globalAlpha = 0.45;
      this.renderer.drawObject(ctx, Object.assign(new GDObject(this.current, this.hover[0], this.hover[1])));
      ctx.globalAlpha = 1;
    }
  }

  bind() {
    const c = this.canvas;
    const pointers = new Map();
    let drag = null;
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (pointers.size === 2) { drag = { type: "pinch", d: this.pinchDist(pointers), cam: { ...this.renderer.cam } }; return; }
      const [wx, wy] = this.renderer.screenToWorld(e.offsetX, e.offsetY);
      const panBtn = e.button === 1 || e.button === 2 || this.space;
      if (panBtn) { drag = { type: "pan", sx: e.offsetX, sy: e.offsetY, cam: { ...this.renderer.cam } }; return; }
      if (this.mode === "build") {
        if (this.swipe) { drag = { type: "paint" }; this.placeAt(wx, wy, true); }
        else drag = { type: "tap", sx: e.offsetX, sy: e.offsetY, cam: { ...this.renderer.cam }, wx, wy };
      } else if (this.mode === "delete") {
        drag = { type: "erase" };
        const o = this.renderer.objectAt(wx, wy);
        if (o) this.removeObjects([o]);
      } else {
        const o = this.renderer.objectAt(wx, wy);
        if (o && this.selection.has(o) && !e.shiftKey) {
          drag = { type: "move", wx, wy, start: [...this.selection].map((s) => [s, s.x, s.y]), moved: false };
        } else if (this.swipe || e.shiftKey) {
          drag = { type: "box", wx, wy, add: e.shiftKey };
          this.box = [wx, wy, wx, wy];
        } else {
          drag = { type: "tapsel", sx: e.offsetX, sy: e.offsetY, cam: { ...this.renderer.cam }, wx, wy, o };
        }
      }
    });
    c.addEventListener("pointermove", (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
      const [wx, wy] = this.renderer.screenToWorld(e.offsetX, e.offsetY);
      const prevHover = this.hover;
      this.hover = this.mode === "build" && e.pointerType === "mouse" ? [snap(wx), snap(wy)] : null;
      if (String(prevHover) !== String(this.hover)) this.redraw();
      if (!drag) return;
      const cam = this.renderer.cam;
      if (drag.type === "pinch" && pointers.size === 2) {
        const d = this.pinchDist(pointers);
        cam.zoom = Math.max(0.15, Math.min(6, drag.cam.zoom * (d / drag.d)));
        this.redraw();
      } else if (drag.type === "pan" || drag.type === "tap" || (drag.type === "tapsel" && !drag.o)) {
        const dx = e.offsetX - drag.sx, dy = e.offsetY - drag.sy;
        if (drag.type !== "pan" && Math.hypot(dx, dy) < 6) return;
        drag.type = "pan";
        cam.x = drag.cam.x - dx / cam.zoom; cam.y = drag.cam.y + dy / cam.zoom;
        this.redraw();
      } else if (drag.type === "tapsel" && drag.o) {
        if (Math.hypot(e.offsetX - drag.sx, e.offsetY - drag.sy) < 6) return;
        if (!this.selection.has(drag.o)) this.select([drag.o]);
        drag = { type: "move", wx: drag.wx, wy: drag.wy, start: [...this.selection].map((s) => [s, s.x, s.y]), moved: false };
      } else if (drag.type === "paint") {
        this.placeAt(wx, wy, true);
      } else if (drag.type === "erase") {
        const o = this.renderer.objectAt(wx, wy);
        if (o) this.removeObjects([o]);
      } else if (drag.type === "box") {
        this.box[2] = wx; this.box[3] = wy; this.redraw();
      } else if (drag.type === "move") {
        if (this.readOnly) return;
        let dx = wx - drag.wx, dy = wy - drag.wy;
        if (!e.altKey) { dx = Math.round(dx / GRID) * GRID; dy = Math.round(dy / GRID) * GRID; }
        if (!drag.moved) { drag.before = drag.start.map(([o]) => o.snapshot()); drag.moved = true; }
        for (const [o, x, y] of drag.start) { o.x = x + dx; o.y = y + dy; }
        this.redraw();
      }
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (!drag) return;
      if (drag.type === "tap") this.placeAt(drag.wx, drag.wy, false);
      else if (drag.type === "tapsel") {
        if (drag.o) this.select(e.shiftKey || e.ctrlKey || e.metaKey ? [...this.selection, drag.o] : [drag.o]);
        else this.select([]);
      } else if (drag.type === "box") {
        const [x1, y1, x2, y2] = this.box;
        const found = this.renderer.objectsInRect(x1, y1, x2, y2);
        this.select(drag.add ? [...this.selection, ...found] : found);
        this.box = null;
      } else if (drag.type === "move" && drag.moved) {
        const objs = drag.start.map(([o]) => o);
        this.pushHistory({ type: "modify", objs, before: drag.before, after: objs.map((o) => o.snapshot()) });
      }
      if (pointers.size === 0) drag = null;
      this.redraw();
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("pointerleave", () => { if (this.hover) { this.hover = null; this.redraw(); } });
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const cam = this.renderer.cam;
      if (e.ctrlKey || e.metaKey || !e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.altKey) {
        const [wx, wy] = this.renderer.screenToWorld(e.offsetX, e.offsetY);
        const f = Math.exp(-e.deltaY * 0.0015);
        cam.zoom = Math.max(0.15, Math.min(6, cam.zoom * f));
        const [nx, ny] = this.renderer.screenToWorld(e.offsetX, e.offsetY);
        cam.x += wx - nx; cam.y += wy - ny;
      } else {
        cam.x += (e.deltaX || e.deltaY) / cam.zoom;
      }
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
      if (k === "1") return this.setMode("build");
      if (k === "2") return this.setMode("edit");
      if (k === "3") return this.setMode("delete");
      if (k === "delete" || k === "backspace") return this.deleteSelected();
      if (k === "escape") return this.select([]);
      const step = e.shiftKey ? 150 : e.altKey ? 2 : 30;
      if (this.selection.size) {
        if (k === "w") return this.moveSel(0, step);
        if (k === "s") return this.moveSel(0, -step);
        if (k === "a") return this.moveSel(-step, 0);
        if (k === "d") return this.moveSel(step, 0);
        if (k === "q") return this.rotateSel(e.shiftKey ? -45 : -90);
        if (k === "e") return this.rotateSel(e.shiftKey ? 45 : 90);
      }
      const cam = this.renderer.cam;
      if (k === "arrowleft") { cam.x -= 90 / cam.zoom * 2; this.redraw(); }
      if (k === "arrowright") { cam.x += 90 / cam.zoom * 2; this.redraw(); }
      if (k === "arrowup") { cam.y += 60 / cam.zoom * 2; this.redraw(); }
      if (k === "arrowdown") { cam.y -= 60 / cam.zoom * 2; this.redraw(); }
    };
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    this.onResize = () => { this.renderer.resize(); if (this.mode === "build") this.renderGrid(); this.redraw(); };
    window.addEventListener("resize", this.onResize);
  }

  pinchDist(p) { const [a, b] = [...p.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1; }
  zoom(f) { this.renderer.cam.zoom = Math.max(0.15, Math.min(6, this.renderer.cam.zoom * f)); this.redraw(); }

  // ---------------- editing ----------------
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
    const objs = this.level.objects;
    if (e.type === "add" || e.type === "remove") {
      const adding = (e.type === "add") === (dir === "redo");
      if (adding) { for (const o of e.objs) objs.push(o); }
      else { const s = new Set(e.objs); this.level.objects = objs.filter((o) => !s.has(o)); this.renderer.level.objects = this.level.objects; for (const o of e.objs) this.selection.delete(o); }
    } else if (e.type === "modify") {
      e.objs.forEach((o, i) => o.restore(dir === "undo" ? e.before[i] : e.after[i]));
    }
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
    this.renderer.level.objects = this.level.objects;
    list.forEach((o) => this.selection.delete(o));
    this.pushHistory({ type: "remove", objs: list });
  }
  modify(objs, fn, { live = false } = {}) {
    if (!this.guard() || !objs.length) return;
    if (!this.pending) this.pending = { objs, before: objs.map((o) => o.snapshot()) };
    objs.forEach(fn);
    if (live) { this.markDirty(); return; }
    const p = this.pending; this.pending = null;
    this.pushHistory({ type: "modify", objs: p.objs, before: p.before, after: p.objs.map((o) => o.snapshot()) });
  }

  placeAt(wx, wy, painting) {
    if (!this.guard()) return;
    const x = snap(wx), y = snap(wy);
    if (painting && this.level.objects.some((o) => o.id === this.current && o.x === x && o.y === y)) return;
    if (!painting && this.level.objects.some((o) => o.id === this.current && o.x === x && o.y === y)) {
      const o = this.level.objects.find((q) => q.id === this.current && q.x === x && q.y === y);
      this.select([o]);
      return;
    }
    const o = new GDObject(this.current, x, y);
    const d = this.db.get(this.current);
    if (d?.cat === "trigger") {
      if (this.current === 899) { o.set("7", 255); o.set("8", 255); o.set("9", 255); o.set("10", "0.5"); o.set("23", 1); }
      if (LEGACY_COLOR_TARGET[this.current]) { o.set("7", 255); o.set("8", 255); o.set("9", 255); o.set("10", "0.5"); }
      if (this.current === 901 || this.current === 1346) o.set("10", "0.5");
      if (this.current === 1007) { o.set("10", "0.5"); o.set("35", 1); }
    }
    if (this.current === 31) { o.set("kA2", 0); o.set("kA4", 0); }
    this.addObjects([o]);
    this.select([o]);
  }

  select(list) { this.selection = new Set(list); this.redraw(); }
  sel() { return [...this.selection]; }
  deleteSelected() { this.removeObjects(this.sel()); }
  moveSel(dx, dy) { this.modify(this.sel(), (o) => { o.x += dx; o.y += dy; }); }
  flipSel(axis) {
    const objs = this.sel();
    if (!objs.length) return;
    const cx = objs.reduce((a, o) => a + o.x, 0) / objs.length, cy = objs.reduce((a, o) => a + o.y, 0) / objs.length;
    this.modify(objs, (o) => {
      if (axis === "x") { o.flipX = !o.flipX; o.x = 2 * cx - o.x; o.rot = -o.rot; }
      else { o.flipY = !o.flipY; o.y = 2 * cy - o.y; o.rot = -o.rot; }
    });
  }
  rotateSel(deg) {
    const objs = this.sel();
    if (!objs.length) return;
    const cx = objs.reduce((a, o) => a + o.x, 0) / objs.length, cy = objs.reduce((a, o) => a + o.y, 0) / objs.length;
    const a = (-deg * Math.PI) / 180;
    this.modify(objs, (o) => {
      const x = o.x - cx, y = o.y - cy;
      if (objs.length > 1) { o.x = cx + x * Math.cos(a) - y * Math.sin(a); o.y = cy + x * Math.sin(a) + y * Math.cos(a); }
      o.rot = ((o.rot + deg + 540) % 360) - 180;
    });
  }
  rotateSelTo(deg, live) { this.modify(this.sel(), (o) => { o.rot = deg; }, { live }); }
  scaleSel(s, live) { this.modify(this.sel(), (o) => { o.sx = o.sy = s; }, { live }); }

  copy() {
    const objs = this.sel();
    if (!objs.length) return toast("Nothing selected");
    this.clipboard = objs.map((o) => o.clone());
    toast(`Copied ${objs.length}`);
  }
  paste() {
    if (!this.clipboard.length) return toast("Clipboard is empty");
    const list = this.clipboard.map((o) => o.clone());
    this.addObjects(list);
    this.select(list);
  }

  // ---------------- popups ----------------
  popup(titleStr, body, actions = []) {
    let close;
    const p = panel("", h("div", { class: "center" }, text(titleStr, { font: "goldFont", size: 32, align: "center" })), body,
      h("div", { class: "row center", style: { marginTop: "14px" } }, ...actions, btn("OK", () => close(), { small: true })));
    close = modal(p, { onClose: () => this.redraw() });
    return close;
  }

  field(label, input) { return h("label", { class: "ed-field" }, h("span", null, label), input); }

  editObjectPopup() {
    const objs = this.sel();
    if (!objs.length) return toast("Select objects first");
    const o = objs[0];
    const chan = (key, val) => h("input", { class: "gd-input", type: "number", min: 0, max: 1101, value: val ?? "", placeholder: "default",
      onchange: (e) => this.modify(objs, (x) => { x[key] = e.target.value === "" ? null : +e.target.value; }) });
    const hsv = (en, key) => {
      const cur = String(o.props[key] || "0a1a1a0a0").split("a");
      const parts = ["Hue", "Saturation", "Brightness"].map((n, i) => h("input", { class: "gd-input", type: "number", step: i ? 0.05 : 1, value: cur[i] ?? (i ? 1 : 0), style: { width: "90px" }, title: n }));
      const apply = () => this.modify(objs, (x) => { x.set(en, true); x.set(key, `${parts[0].value}a${parts[1].value}a${parts[2].value}a${cur[3] || 0}a${cur[4] || 0}`); });
      parts.forEach((p) => p.addEventListener("change", apply));
      return h("div", { class: "row" }, ...parts, btn("Reset", () => this.modify(objs, (x) => { x.set(en, null); x.set(key, null); }), { small: true, color: "grey" }));
    };
    this.popup("Edit Object", h("div", { class: "col" },
      this.field("Main color channel", chan("col1", o.col1)),
      this.field("Detail color channel", chan("col2", o.col2)),
      h("div", { class: "small muted" }, `Specials: ${Object.entries(SPECIAL_CHANNELS).map(([k, v]) => `${v} ${k}`).join(", ")}`),
      this.field("Main HSV", hsv("41", "43")),
      this.field("Detail HSV", hsv("42", "44"))));
  }

  editGroupPopup() {
    const objs = this.sel();
    if (!objs.length) return toast("Select objects first");
    const o = objs[0];
    const groupsEl = h("div", { class: "row" });
    const renderGroups = () => {
      const all = [...new Set(objs.flatMap((x) => x.groups))].sort((a, b) => a - b);
      groupsEl.replaceChildren(...all.map((g) => h("button", { class: "ed-chip", title: "Remove", onclick: () => { this.modify(objs, (x) => { x.groups = x.groups.filter((y) => y !== g); }); renderGroups(); } }, `${g} ✕`)));
      if (!all.length) groupsEl.append(h("span", { class: "small muted" }, "No groups"));
    };
    renderGroups();
    const gIn = h("input", { class: "gd-input", type: "number", min: 1, max: 9999, placeholder: "Group ID", style: { width: "120px" } });
    const nextFree = () => { const used = new Set(this.level.objects.flatMap((x) => x.groups)); let i = 1; while (used.has(i)) i++; return i; };
    const num = (key, val, ph) => h("input", { class: "gd-input", type: "number", value: val ?? "", placeholder: ph, onchange: (e) => this.modify(objs, (x) => { x[key] = e.target.value === "" ? null : +e.target.value; }) });
    const zl = h("select", { class: "gd-input", onchange: (e) => this.modify(objs, (x) => { x.zLayer = e.target.value === "" ? null : +e.target.value; }) },
      ...[["", "Default"], ["-3", "B4"], ["-1", "B3"], ["1", "B2"], ["3", "B1"], ["5", "T1"], ["7", "T2"], ["9", "T3"]].map(([v, l]) => h("option", { value: v, selected: String(o.zLayer ?? "") === v }, l)));
    this.popup("Edit Group", h("div", { class: "col" },
      groupsEl,
      h("div", { class: "row" }, gIn,
        btn("Add", () => { const g = +gIn.value; if (!g) return; this.modify(objs, (x) => { if (!x.groups.includes(g)) x.groups.push(g); }); renderGroups(); }, { small: true }),
        btn("Next Free", () => { gIn.value = nextFree(); }, { small: true, color: "grey" })),
      this.field("Z Layer", zl),
      this.field("Z Order", num("zOrder", o.zOrder, "default")),
      this.field("Editor Layer", num("layer", o.layer || "", "0"))));
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
      else if (type === "rgb") {
        input = h("input", { type: "color", value: rgbHex(o.num("7", 255), o.num("8", 255), o.num("9", 255)), onchange: (e) => {
          const [r, g, b] = hexRgb(e.target.value);
          this.modify([o], (x) => { x.set("7", r); x.set("8", g); x.set("9", b); });
        } });
      } else if (type === "easing") input = h("select", { class: "gd-input", onchange: (e) => set(e.target.value === "0" ? null : e.target.value) }, ...EASINGS.map((n, i) => h("option", { value: i, selected: +(val || 0) === i }, n)));
      else if (type === "gamemode") input = h("select", { class: "gd-input", onchange: (e) => set(e.target.value) }, ...GAMEMODES.map((n, i) => h("option", { value: i, selected: +(val || 0) === i }, n)));
      else if (type === "speed") input = h("select", { class: "gd-input", onchange: (e) => set(e.target.value) }, ...SPEEDS.map(([n, v]) => h("option", { value: v, selected: +(val || 0) === v }, n)));
      else input = h("input", { class: "gd-input", type: "number", step: type === "num" ? "any" : 1, value: val ?? "", placeholder: def !== undefined ? String(def) : "", onchange: (e) => set(e.target.value) });
      body.append(this.field(label, input));
    }
    this.popup(o.id === 31 ? "Start Position" : TRIGGER_NAMES[o.id] || `Object ${o.id}`, body, [btn("Raw", () => this.rawPopup(o), { small: true, color: "grey" })]);
  }

  rawPopup(o) {
    const ta = h("textarea", { class: "gd-input", style: { width: "100%", minHeight: "160px", fontFamily: "monospace" } },
      Object.entries(o.props).map(([k, v]) => `${k},${v}`).join("\n"));
    this.popup(`Object ${o.id} properties`, h("div", { class: "col" }, h("div", { class: "small muted" }, "One key,value per line (position, rotation, groups, colors are edited elsewhere)."), ta),
      [btn("Apply", () => this.modify([o], (x) => {
        x.props = {};
        for (const line of ta.value.split("\n")) { const i = line.indexOf(","); if (i > 0) x.props[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
      }), { small: true })]);
  }

  colorsPopup() {
    let id = 1000;
    const body = h("div", { class: "col" });
    const render = () => {
      const c = this.level.colors.get(id) || { r: 255, g: 255, b: 255, player: -1, blend: false, opacity: 1 };
      const cur = this.renderer.channel(id).rgb;
      const update = (patch) => {
        if (!this.guard()) return;
        this.level.colors.set(id, { ...c, ...patch });
        this.markDirty(); render();
      };
      body.replaceChildren(
        h("div", { class: "row" }, ...[1000, 1001, 1009, 1013, 1002, 1003, 1004, 1007].map((ch) => btn(SPECIAL_CHANNELS[ch], () => { id = ch; render(); }, { small: true, color: ch === id ? "" : "grey" }))),
        this.field("Channel ID", h("input", { class: "gd-input", type: "number", min: 1, max: 1014, value: id, onchange: (e) => { id = +e.target.value || 1; render(); } })),
        this.field("Color", h("input", { type: "color", value: rgbHex(...cur), onchange: (e) => { const [r, g, b] = hexRgb(e.target.value); update({ r, g, b, player: -1 }); } })),
        this.field("Opacity", h("input", { type: "range", min: 0, max: 1, step: 0.01, value: c.opacity ?? 1, onchange: (e) => update({ opacity: +e.target.value }) })),
        this.field("Blending", h("input", { type: "checkbox", checked: !!c.blend, onchange: (e) => update({ blend: e.target.checked }) })),
        this.field("Player color", h("select", { class: "gd-input", onchange: (e) => update({ player: +e.target.value }) }, ...[["-1", "None"], ["1", "P1"], ["2", "P2"]].map(([v, l]) => h("option", { value: v, selected: String(c.player ?? -1) === v }, l)))),
        this.field("Copy channel", h("input", { class: "gd-input", type: "number", value: c.copy || "", placeholder: "none", onchange: (e) => update({ copy: +e.target.value || 0 }) })),
        h("div", { class: "small muted" }, `Channels used in this level: ${[...this.level.colors.keys()].sort((a, b) => a - b).join(", ")}`));
    };
    render();
    this.popup("Colors", body);
  }

  settingsPopup() {
    const hd = this.level.header;
    const set = (k, v) => { if (!this.guard()) return; hd[k] = String(v); this.markDirty(); if (k === "kA6" || k === "kA7") this.renderer.loadBackgrounds().then(() => this.redraw()); };
    const sel = (k, opts) => h("select", { class: "gd-input", onchange: (e) => set(k, e.target.value) }, ...opts.map(([l, v]) => h("option", { value: v, selected: String(hd[k] ?? "0") === String(v) }, l)));
    const chk = (k) => h("input", { type: "checkbox", checked: hd[k] === "1", onchange: (e) => set(k, e.target.checked ? 1 : 0) });
    const m = this.meta;
    this.popup("Level Settings", h("div", { class: "col" },
      this.field("Name", h("input", { class: "gd-input", value: m.name || "", maxlength: 20, onchange: (e) => { m.name = e.target.value; this.dirty = true; this.redraw(); } })),
      this.field("Description", h("textarea", { class: "gd-input", maxlength: 180, onchange: (e) => { m.description = e.target.value; this.dirty = true; } }, m.description || "")),
      this.field("Start gamemode", sel("kA2", GAMEMODES.map((n, i) => [n, i]))),
      this.field("Start speed", sel("kA4", SPEEDS)),
      this.field("Mini", chk("kA3")), this.field("Dual", chk("kA8")), this.field("Two player", chk("kA10")), this.field("Platformer", chk("kA22")),
      this.field("Background", h("input", { class: "gd-input", type: "number", min: 0, max: 59, value: hd.kA6 || 0, onchange: (e) => set("kA6", e.target.value) })),
      this.field("Ground", h("input", { class: "gd-input", type: "number", min: 0, max: 22, value: hd.kA7 || 0, onchange: (e) => set("kA7", e.target.value) })),
      this.field("Official song", h("select", { class: "gd-input", onchange: (e) => { m.officialSong = +e.target.value; m.songID = 0; this.dirty = true; } }, ...OFFICIAL_SONGS.map((n, i) => h("option", { value: i, selected: (m.officialSong || 0) === i && !m.songID }, n)))),
      this.field("Custom song ID", h("input", { class: "gd-input", type: "number", value: m.songID || "", placeholder: "none", onchange: (e) => { m.songID = +e.target.value || 0; this.dirty = true; } })),
      this.field("Song offset (s)", h("input", { class: "gd-input", type: "number", step: "any", value: hd.kA13 || 0, onchange: (e) => set("kA13", e.target.value) }))));
  }

  pausePopup() {
    let close;
    const b = (label, fn, color) => btn(label, () => { close(); fn(); }, { color });
    const ro = this.readOnly;
    const p = panel("", h("div", { class: "center" }, text(this.meta.name || "Untitled", { font: "goldFont", size: 34, align: "center" })),
      h("div", { class: "col", style: { alignItems: "center" } },
        b("Resume", () => {}),
        ro ? null : b("Save", () => this.save()),
        ro ? null : b("Save and Exit", async () => { if (await this.save()) this.onExit?.(); }),
        b(ro ? "Exit" : "Exit without saving", () => { if (!this.dirty || ro || confirm("Discard unsaved changes?")) this.onExit?.(); }, "grey"),
        ro ? null : b("Export .gmd", () => this.onExport?.("gmd")),
        ro ? null : b("Copy level string", () => this.onExport?.("string"), "grey"),
        ro ? null : b("Upload to GD servers", () => this.onUpload?.(), "cyan"),
        h("div", { class: "small muted center", style: { maxWidth: "420px" } }, "Shortcuts: 1/2/3 modes · WASD move (Shift = 5 blocks, Alt = small) · Q/E rotate · Ctrl+C/V/D copy, paste, duplicate · Ctrl+Z/Y undo/redo · Ctrl+S save · Space/right-drag pan · wheel zoom · Shift+drag box select")));
    close = modal(p);
  }

  async save() {
    if (this.readOnly) return false;
    try {
      await this.onSave?.(this.level.serialize(), this.meta);
      this.dirty = false;
      this.redraw();
      toast("Saved", "ok");
      return true;
    } catch (e) { toast(e.message, "error"); return false; }
  }
}
