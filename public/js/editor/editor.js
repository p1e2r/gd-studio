// GD-style level editor with a GD Place-style menu (build / edit / delete), no playtest.
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

// ---- small inline SVG icons (own drawings) ----
const svg = (body) => {
  const s = document.createElement("span");
  s.className = "gp-ico";
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return s;
};
const ICONS = {
  build: () => svg('<path d="M13 5l6 6"/><path d="M10.5 7.5l6 6-2 2-6-6z"/><path d="M9.5 10.5L3 17l4 4 6.5-6.5"/><path d="M14 3.5l2.5-1 5 5-1 2.5"/>'),
  edit: () => svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  del: () => svg('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>'),
  caret: () => svg('<path d="M6 15l6-6 6 6"/>'),
  undo: () => svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>'),
  redo: () => svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 000 10h3"/>'),
  copy: () => svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>'),
  paste: () => svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.5h6V4"/>'),
  dup: () => svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M14 11v6M11 14h6"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>'),
  deselect: () => svg('<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  colors: () => svg('<circle cx="12" cy="12" r="8"/><circle cx="9" cy="10" r="1.3" fill="currentColor"/><circle cx="14" cy="9" r="1.3" fill="currentColor"/><circle cx="15.5" cy="13.5" r="1.3" fill="currentColor"/>'),
  gear: () => svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  pause: () => svg('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'),
  arrow: () => svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  flip: () => svg('<path d="M12 3v18"/><path d="M9 7L4 12l5 5z"/><path d="M15 7l5 5-5 5z" fill="currentColor"/>'),
  rot: () => svg('<path d="M20 12a8 8 0 11-3-6.2"/><path d="M18 2v4h-4"/>'),
  rot45: () => svg('<path d="M20 12a8 8 0 11-3-6.2"/><path d="M18 2v4h-4"/><text x="12" y="15.5" font-size="7.5" text-anchor="middle" fill="currentColor" stroke="none">45</text>'),
  plus: () => svg('<path d="M12 5v14M5 12h14"/>'),
  minus: () => svg('<path d="M5 12h14"/>'),
  swipe: () => svg('<path d="M4 17c3-6 6-6 8-3s5 3 8-3"/><circle cx="20" cy="11" r="1.5" fill="currentColor"/>'),
};

const LAYERS_BOTTOM = [["B4", -3], ["B3", -1], ["B2", 1], ["B1", 3]];
const LAYERS_TOP = [["T1", 5], ["T2", 7], ["T3", 9]];
const CHANNEL_QUICK = [["Def", null], ...Array.from({ length: 12 }, (_, i) => [String(i + 1), i + 1]), ["BG", 1000], ["G1", 1001], ["G2", 1009], ["Line", 1002], ["3DL", 1003], ["Obj", 1004], ["P1", 1005], ["P2", 1006], ["LBG", 1007], ["Blk", 1010], ["Wht", 1011]];

export class Editor {
  constructor(root, { level, meta = {}, readOnly = false, onSave, onExit, onUpload, onExport }) {
    this.root = root;
    this.level = level;
    this.meta = meta;
    this.readOnly = readOnly;
    this.onSave = onSave; this.onExit = onExit; this.onUpload = onUpload; this.onExport = onExport;
    this.mode = "build";
    this.editTab = "Transform";
    this.selection = new Set();
    this.current = 1;
    this.tab = "block";
    this.swipe = false;
    this.widget = null; // rotate | scale | warp
    this.preview = null; // [x,y] where the next object will be placed
    this.minimized = false;
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
    this.renderer.cam = { x: this.renderer.W / 2 / z - 90, y: (this.renderer.H / 2 - 280) / z, zoom: z };
    this.preview = [snap(this.renderer.cam.x), 15];
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

  // ================= DOM =================
  label(str, size = 18) { return text(str, { font: "bigFont", size }); }

  buildDom() {
    const tool = (icon, title, fn) => h("button", { class: "gp-tool", title, "aria-label": title, onclick: fn }, icon());
    this.infoEl = h("div", { class: "gp-info" });
    this.swipeBtn = tool(ICONS.swipe, "Swipe (paint / delete / box select by dragging)", () => { this.swipe = !this.swipe; this.swipeBtn.classList.toggle("on", this.swipe); if (this.mode === "delete") this.renderContent(); });
    const top = h("div", { class: "gp-top" },
      h("div", { class: "gp-toolbar menu-panel" }, tool(ICONS.undo, "Undo (Ctrl+Z)", () => this.undo()), tool(ICONS.redo, "Redo (Ctrl+Y)", () => this.redo()),
        tool(ICONS.copy, "Copy (Ctrl+C)", () => this.copy()), tool(ICONS.paste, "Paste (Ctrl+V)", () => this.paste()),
        tool(ICONS.dup, "Duplicate (Ctrl+D)", () => { this.copy(); this.paste(); }), tool(ICONS.deselect, "Deselect (Esc)", () => this.select([]))),
      this.infoEl,
      h("div", { class: "gp-toolbar menu-panel" }, this.swipeBtn,
        tool(ICONS.plus, "Zoom in", () => this.zoom(1.25)), tool(ICONS.minus, "Zoom out", () => this.zoom(0.8)),
        tool(ICONS.colors, "Level colors", () => this.colorsPopup()), tool(ICONS.gear, "Level settings", () => this.settingsPopup()), tool(ICONS.pause, "Menu", () => this.pausePopup())));

    this.tabsEl = h("ul", { class: "gp-tab-options thin-scrollbar", onwheel: (e) => { e.currentTarget.scrollLeft += e.deltaY / 3; } });
    this.sideBtns = {};
    const side = h("ul", { class: "gp-side-list" }, ...[["build", ICONS.build, "Build (1)"], ["edit", ICONS.edit, "Edit (2)"], ["delete", ICONS.del, "Delete (3)"]].map(([m, ic, t]) => {
      const b = h("button", { class: "gp-side-btn", title: t, "aria-label": t, onclick: () => this.setMode(m) }, ic());
      this.sideBtns[m] = b;
      return h("li", null, b);
    }));
    this.contentEl = h("div", { class: "gp-content" });
    this.minBtn = h("button", { class: "gp-min-btn", title: "Minimize menu", onclick: () => this.toggleMin() }, ICONS.caret());
    this.grid = h("div", { class: "gp-grid" },
      h("div", { class: "gp-minimize menu-panel" }, this.minBtn),
      h("fieldset", { class: "gp-tabs menu-panel" }, this.tabsEl),
      h("fieldset", { class: "gp-side menu-panel" }, side),
      h("div", { class: "gp-buttons menu-panel" }, this.contentEl));
    this.actionBtn = h("button", { class: "gp-action", onclick: () => this.mainAction() });
    this.menu = h("div", { class: "gp-menu", "data-min": "0" }, this.grid, h("div", { class: "gp-action-wrap menu-panel" }, this.actionBtn));
    this.root.replaceChildren(h("div", { class: "ed-root gp" }, this.canvas, top, this.menu));
    this.setMode("build");
  }

  toggleMin() {
    this.minimized = !this.minimized;
    this.menu.dataset.min = this.minimized ? "1" : "0";
    this.minBtn.classList.toggle("flip", this.minimized);
  }

  setMode(m) {
    this.mode = m;
    if (m !== "edit") this.widget = null;
    for (const [k, b] of Object.entries(this.sideBtns)) b.classList.toggle("on", k === m);
    this.renderTabs();
    this.renderContent();
    this.renderAction();
    this.redraw();
  }

  renderAction() {
    const label = this.mode === "build" ? "Place" : this.mode === "delete" ? "Delete" : this.selection.size ? "Deselect" : "Select";
    this.actionBtn.className = `gp-action ${this.mode === "delete" ? "red" : this.mode === "edit" ? "cyan" : "green"}`;
    this.actionBtn.replaceChildren(text(label, { font: "bigFont", size: 30 }));
  }

  mainAction() {
    if (this.mode === "build") this.placeAt(...(this.preview || [this.renderer.cam.x, this.renderer.cam.y]), false, true);
    else if (this.mode === "delete") { if (this.selection.size) this.deleteSelected(); else toast("Tap objects to delete them"); }
    else if (this.selection.size) this.select([]);
    else toast("Tap objects to select them");
  }

  renderTabs() {
    const li = (content, on, fn, title) => h("li", { class: `gp-tab ${on ? "on" : ""}`, title }, h("button", { onclick: fn, "aria-label": title }, content), on ? h("div", { class: "sliding-selector" }) : null);
    if (this.mode === "build") {
      this.tabsEl.replaceChildren(...TABS.map(([label, key]) => {
        const ids = this.db.byTab[key];
        const c = h("canvas", { width: 72, height: 72 });
        if (ids[0]) this.renderer.thumb(c, ids[0]);
        return li(c, this.tab === key, () => { this.tab = key; this.renderTabs(); this.renderContent(); }, label);
      }));
    } else if (this.mode === "edit") {
      this.tabsEl.replaceChildren(...["Transform", "Layers", "Colors", "Groups", "Special"].map((t) =>
        li(this.label(t, 17), this.editTab === t, () => { this.editTab = t; if (t !== "Transform") this.widget = null; this.renderTabs(); this.renderContent(); this.redraw(); }, t)));
    } else {
      this.tabsEl.replaceChildren(li(this.label("Delete", 20), true, () => {}, "Delete"));
    }
  }

  renderContent() {
    const c = this.contentEl;
    if (this.mode === "build") return this.renderObjects();
    if (this.mode === "delete") return c.replaceChildren(this.deletePane());
    const objs = this.sel();
    if (!objs.length) return c.replaceChildren(h("div", { class: "gp-empty" }, this.label("Tap an object to select it", 22)));
    const pane = { Transform: () => this.transformPane(), Layers: () => this.layersPane(objs), Colors: () => this.colorsPane(objs), Groups: () => this.groupsPane(objs), Special: () => this.specialPane(objs) }[this.editTab]();
    c.replaceChildren(pane);
  }

  renderObjects() {
    const ids = this.db.byTab[this.tab] || [];
    this.contentEl.replaceChildren(h("ul", { class: "gp-object-grid thin-scrollbar" }, ids.map((id) => {
      const cv = h("canvas", { width: 96, height: 96 });
      this.renderer.thumb(cv, id);
      const name = TRIGGER_NAMES[id] ? `${TRIGGER_NAMES[id]} (${id})` : `Object ${id}`;
      return h("li", { class: "gp-obj" }, h("button", { title: name, "aria-label": name, onclick: () => { this.current = id; this.renderObjects(); this.redraw(); } }, cv),
        this.current === id ? h("div", { class: "sliding-selector" }) : null);
    })));
  }

  // ---------- edit panes ----------
  transformPane() {
    const pad = (amount, label) => {
      const b = (dir, rot, dx, dy) => {
        const i = ICONS.arrow(); i.style.transform = `rotate(${rot}deg)`;
        return h("button", { class: `gp-move ${dir} white-button`, title: `Move ${label} ${dir}`, "aria-label": `Move ${label} ${dir}`, onclick: () => this.moveSel(dx, dy) }, i);
      };
      return h("div", { class: "gp-move-grid" },
        b("up", 180, 0, amount), b("down", 0, 0, -amount), b("left", 90, -amount, 0), b("right", -90, amount, 0),
        h("p", { class: "gp-amount" }, this.label(label, 13)));
    };
    const tbtn = (icon, title, fn, style = "") => { const i = icon(); if (style) i.style.transform = style; return h("li", { class: "gp-tbtn" }, h("button", { title, "aria-label": title, class: "green bounce-active", onclick: fn }, i)); };
    const widget = (name, key) => h("button", { class: `gp-widget bounce-active ${this.widget === key ? "cyan" : "green"}`, onclick: () => { this.widget = this.widget === key ? null : key; this.renderContent(); this.redraw(); } }, this.label(name, 20));
    return h("fieldset", { class: "gp-transform" },
      h("div", { class: "gp-moves" }, pad(0.5, "Tiny"), pad(2, "Small"), pad(30, "1 Block"), pad(150, "5 Blocks")),
      h("ul", { class: "gp-transforms" },
        tbtn(ICONS.flip, "Flip horizontally", () => this.flipSel("x")),
        tbtn(ICONS.flip, "Flip vertically", () => this.flipSel("y"), "rotate(90deg)"),
        tbtn(ICONS.rot, "Rotate 90° counter-clockwise (Q)", () => this.rotateSel(-90), "scaleX(-1)"),
        tbtn(ICONS.rot, "Rotate 90° clockwise (E)", () => this.rotateSel(90)),
        tbtn(ICONS.rot45, "Rotate 45° counter-clockwise (Shift+Q)", () => this.rotateSel(-45), "scaleX(-1)"),
        tbtn(ICONS.rot45, "Rotate 45° clockwise (Shift+E)", () => this.rotateSel(45)),
        tbtn(ICONS.plus, "Scale up", () => this.scaleBy(1.25)),
        tbtn(ICONS.minus, "Scale down", () => this.scaleBy(0.8))),
      h("div", { class: "gp-widgets" }, widget("Rotate", "rotate"), widget("Scale", "scale"), widget("Warp", "warp")));
  }

  layersPane(objs) {
    const o = objs[0];
    const d = this.db.get(o.id);
    const cur = o.zLayer ?? d?.zLayer ?? 5;
    const bottom = cur < 5;
    const setLayer = (v) => { this.modify(objs, (x) => { x.zLayer = v; }); this.renderContent(); };
    const sideBtn = (isBottom, title) => h("li", { class: "gp-layer-side" }, h("button", { title, onclick: () => setLayer(isBottom ? 1 : 5) }, this.label(isBottom ? "Below" : "Above", 16)), bottom === isBottom ? h("div", { class: "sliding-selector" }) : null);
    const list = bottom ? LAYERS_BOTTOM : LAYERS_TOP;
    const zo = o.zOrder ?? d?.zOrder ?? 0;
    const zoBtn = (delta, l) => h("button", { class: "white-button gp-small", onclick: () => { this.modify(objs, (x) => { x.zOrder = (x.zOrder ?? d?.zOrder ?? 0) + delta; }); this.renderContent(); } }, this.label(l, 18));
    return h("fieldset", { class: "gp-layers" },
      h("ul", { class: "gp-layer-sides" }, sideBtn(true, "Layer below player"), sideBtn(false, "Layer above player")),
      h("div", { class: "gp-layer-content" },
        h("ul", { class: "gp-layer-ids" }, list.map(([name, v]) => h("li", null, h("button", { onclick: () => setLayer(v) }, this.label(name, 22)), cur === v ? h("div", { class: "sliding-selector" }) : null))),
        h("div", { class: "gp-row" },
          this.label("Z Order", 18), zoBtn(-1, "-"), h("span", { class: "gp-zo" }, this.label(String(zo), 22)), zoBtn(1, "+"),
          this.label("Editor Layer", 16),
          h("input", { class: "gp-input", type: "number", value: o.layer || 0, style: { width: "70px" }, onchange: (e) => this.modify(objs, (x) => { x.layer = +e.target.value || 0; }) }))));
  }

  colorsPane(objs) {
    const o = objs[0];
    this.colorSlot ||= "col1";
    const d = this.db.get(o.id);
    const current = o[this.colorSlot] ?? null;
    const swatch = (label, ch) => {
      const rgb = ch === null ? (this.colorSlot === "col1" ? this.renderer.channel(d?.col1 ?? 1004).rgb : [128, 128, 128]) : this.renderer.channel(ch).rgb;
      return h("li", { class: "gp-swatch" }, h("button", { title: ch === null ? "Default" : `Channel ${ch}${SPECIAL_CHANNELS[ch] ? ` (${SPECIAL_CHANNELS[ch]})` : ""}`, style: { background: `rgb(${rgb})` }, onclick: () => { this.modify(objs, (x) => { x[this.colorSlot] = ch; }); this.renderContent(); } },
        h("span", null, label)), current === ch ? h("div", { class: "gp-swatch-on" }) : null);
    };
    const slot = (k, l) => h("li", { class: "gp-layer-side" }, h("button", { onclick: () => { this.colorSlot = k; this.renderContent(); } }, this.label(l, 16)), this.colorSlot === k ? h("div", { class: "sliding-selector" }) : null);
    const hsvKey = this.colorSlot === "col1" ? ["41", "43"] : ["42", "44"];
    const curHsv = String(o.props[hsvKey[1]] || "0a1a1a0a0").split("a");
    const hsvIn = (i, step, title) => h("input", { class: "gp-input", type: "number", step, value: curHsv[i] ?? (i ? 1 : 0), title, style: { width: "64px" }, onchange: (e) => {
      curHsv[i] = e.target.value;
      this.modify(objs, (x) => { x.set(hsvKey[0], true); x.set(hsvKey[1], `${curHsv[0]}a${curHsv[1]}a${curHsv[2]}a${curHsv[3] || 0}a${curHsv[4] || 0}`); });
    } });
    return h("fieldset", { class: "gp-layers" },
      h("ul", { class: "gp-layer-sides" }, slot("col1", "Main"), slot("col2", "Detail")),
      h("div", { class: "gp-layer-content" },
        h("ul", { class: "gp-swatches thin-scrollbar" }, CHANNEL_QUICK.map(([l, ch]) => swatch(l, ch))),
        h("div", { class: "gp-row" },
          this.label("Channel", 16), h("input", { class: "gp-input", type: "number", min: 0, max: 1101, value: current ?? "", placeholder: "def", style: { width: "74px" }, onchange: (e) => { this.modify(objs, (x) => { x[this.colorSlot] = e.target.value === "" ? null : +e.target.value; }); this.renderContent(); } }),
          this.label("HSV", 16), hsvIn(0, 1, "Hue"), hsvIn(1, 0.05, "Saturation"), hsvIn(2, 0.05, "Brightness"),
          h("button", { class: "white-button gp-small", onclick: () => this.colorsPopup(current ?? undefined) }, this.label("Edit color", 15)))));
  }

  groupsPane(objs) {
    const all = [...new Set(objs.flatMap((x) => x.groups))].sort((a, b) => a - b);
    const gIn = h("input", { class: "gp-input", type: "number", min: 1, max: 9999, placeholder: "Group ID", style: { width: "110px" } });
    const nextFree = () => { const used = new Set(this.level.objects.flatMap((x) => x.groups)); let i = 1; while (used.has(i)) i++; return i; };
    const add = () => { const g = +gIn.value; if (!g) return; this.modify(objs, (x) => { if (!x.groups.includes(g)) x.groups.push(g); }); this.renderContent(); };
    return h("fieldset", { class: "gp-pane" },
      h("div", { class: "gp-row" }, gIn, h("button", { class: "green bounce-active gp-small", onclick: add }, this.label("Add", 18)),
        h("button", { class: "white-button gp-small", onclick: () => { gIn.value = nextFree(); } }, this.label("Next Free", 16)),
        h("span", { class: "small muted" }, `${objs.length} selected`)),
      h("ul", { class: "gp-chips" }, all.length
        ? all.map((g) => h("li", null, h("button", { class: "white-button", title: "Remove group", onclick: () => { this.modify(objs, (x) => { x.groups = x.groups.filter((y) => y !== g); }); this.renderContent(); } }, this.label(`${g}  x`, 18))))
        : h("li", { class: "muted" }, "No groups")));
  }

  specialPane(objs) {
    if (objs.length !== 1) return h("div", { class: "gp-empty" }, this.label("Select one trigger, start position or text object", 18));
    const o = objs[0];
    if (o.id === 914) {
      let cur = "";
      try { cur = decodeURIComponent(escape(atob((o.props["31"] || "").replace(/-/g, "+").replace(/_/g, "/")))); } catch { cur = ""; }
      const t = h("input", { class: "gp-input", value: cur, style: { flex: 1 } });
      return h("fieldset", { class: "gp-pane" }, this.label("Text", 18), h("div", { class: "gp-row" }, t,
        h("button", { class: "green bounce-active gp-small", onclick: () => this.modify([o], (x) => x.set("31", btoa(unescape(encodeURIComponent(t.value))).replace(/\+/g, "-").replace(/\//g, "_"))) }, this.label("Apply", 18))));
    }
    const fields = o.id === 31 ? START_POS_FIELDS : TRIGGER_FIELDS[o.id];
    const raw = h("button", { class: "white-button gp-small", onclick: () => this.rawPopup(o) }, this.label("Raw props", 15));
    if (!fields) return h("fieldset", { class: "gp-pane" }, h("div", { class: "gp-row" }, this.label(`Object ${o.id} has no special settings`, 18), raw));
    const grid = h("div", { class: "gp-fields thin-scrollbar" });
    for (const [key, label, type, def] of fields) {
      let input;
      const val = o.props[key];
      const set = (v) => this.modify([o], (x) => x.set(key, v));
      if (type === "bool") input = h("input", { type: "checkbox", checked: val === "1", onchange: (e) => set(e.target.checked) });
      else if (type === "rgb") input = h("input", { type: "color", value: rgbHex(o.num("7", 255), o.num("8", 255), o.num("9", 255)), onchange: (e) => { const [r, g, b] = hexRgb(e.target.value); this.modify([o], (x) => { x.set("7", r); x.set("8", g); x.set("9", b); }); } });
      else if (type === "easing") input = h("select", { class: "gp-input", onchange: (e) => set(e.target.value === "0" ? null : e.target.value) }, ...EASINGS.map((n, i) => h("option", { value: i, selected: +(val || 0) === i }, n)));
      else if (type === "gamemode") input = h("select", { class: "gp-input", onchange: (e) => set(e.target.value) }, ...GAMEMODES.map((n, i) => h("option", { value: i, selected: +(val || 0) === i }, n)));
      else if (type === "speed") input = h("select", { class: "gp-input", onchange: (e) => set(e.target.value) }, ...SPEEDS.map(([n, v]) => h("option", { value: v, selected: +(val || 0) === v }, n)));
      else input = h("input", { class: "gp-input", type: "number", step: type === "num" ? "any" : 1, value: val ?? "", placeholder: def !== undefined ? String(def) : "", onchange: (e) => set(e.target.value) });
      grid.append(h("label", { class: "gp-field" }, h("span", null, label), input));
    }
    return h("fieldset", { class: "gp-pane" }, h("div", { class: "gp-row" }, this.label(o.id === 31 ? "Start Position" : TRIGGER_NAMES[o.id] || `Object ${o.id}`, 20), raw), grid);
  }

  deletePane() {
    const objs = this.sel();
    return h("fieldset", { class: "gp-pane" },
      h("div", { class: "gp-row" },
        this.label(objs.length ? `${objs.length} selected` : "Tap objects to delete them", 20),
        h("span", { class: "small muted" }, this.swipe ? "Swipe is on: drag across objects to delete many." : "Turn on Swipe (top right) to delete by dragging.")),
      h("div", { class: "gp-row" },
        h("button", { class: "red bounce-active gp-small", onclick: () => this.deleteSelected() }, this.label("Delete selected", 18)),
        h("button", { class: "white-button gp-small", onclick: () => {
          const ids = new Set(objs.map((o) => o.id));
          if (!ids.size) return toast("Select an object first (Edit mode)");
          if (confirm(`Delete every object with ID ${[...ids].join(", ")}?`)) this.removeObjects(this.level.objects.filter((o) => ids.has(o.id)));
        } }, this.label("Delete all of these IDs", 18)),
        h("button", { class: "white-button gp-small", onclick: () => {
          const id = this.current;
          const list = this.level.objects.filter((o) => o.id === id);
          if (!list.length) return toast(`No objects with ID ${id}`);
          if (confirm(`Delete all ${list.length} objects with ID ${id} (current build object)?`)) this.removeObjects(list);
        } }, this.label("Delete all of build object", 18))));
  }

  // ================= loop / input =================
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

  selCenter() {
    const objs = this.sel();
    if (!objs.length) return null;
    return [objs.reduce((a, o) => a + o.x, 0) / objs.length, objs.reduce((a, o) => a + o.y, 0) / objs.length];
  }

  gizmoHandles() {
    if (this.mode !== "edit" || !this.widget || !this.selection.size) return null;
    const c = this.selCenter();
    const r = 70 / this.renderer.cam.zoom;
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
    if (this.mode === "build" && this.preview) {
      ctx.globalAlpha = 0.6;
      this.renderer.drawObject(ctx, new GDObject(this.current, this.preview[0], this.preview[1]));
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 2 / z; ctx.setLineDash([5 / z, 4 / z]);
      ctx.strokeRect(this.preview[0] - 15, this.preview[1] - 15, 30, 30);
      ctx.setLineDash([]);
    }
    if (this.box) {
      const [x1, y1, x2, y2] = this.box;
      ctx.fillStyle = "rgba(0,255,0,0.12)"; ctx.strokeStyle = "rgba(0,255,0,0.8)"; ctx.lineWidth = 1 / z;
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    }
    const g = this.gizmoHandles();
    if (g) {
      ctx.lineWidth = 3 / z;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath(); ctx.arc(g.c[0], g.c[1], g.r, 0, Math.PI * 2); ctx.stroke();
      for (const hd of g.handles) {
        ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 3 / z;
        ctx.beginPath(); ctx.moveTo(g.c[0], g.c[1]); ctx.lineTo(hd.x, hd.y); ctx.stroke();
        ctx.fillStyle = hd.k === "wy" ? "#35CECE" : "#7ADE2D";
        ctx.beginPath(); ctx.arc(hd.x, hd.y, 9 / z, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#000"; ctx.lineWidth = 2 / z; ctx.stroke();
      }
    }
  }

  bind() {
    const c = this.canvas;
    const pointers = new Map();
    let drag = null;
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("dblclick", (e) => {
      if (this.mode !== "build" || this.swipe) return;
      const [wx, wy] = this.renderer.screenToWorld(e.offsetX, e.offsetY);
      this.placeAt(wx, wy, false, true);
    });
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
        if (this.swipe) { drag = { type: "paint" }; this.placeAt(wx, wy, true); }
        else drag = { type: "tap", sx: e.offsetX, sy: e.offsetY, cam: { ...this.renderer.cam }, wx, wy };
      } else if (this.mode === "delete") {
        if (this.swipe) {
          drag = { type: "erase" };
          const o = this.renderer.objectAt(wx, wy);
          if (o) this.removeObjects([o]);
        } else drag = { type: "tapdel", sx: e.offsetX, sy: e.offsetY, cam: { ...this.renderer.cam }, wx, wy };
      } else {
        const o = this.renderer.objectAt(wx, wy);
        if (o && this.selection.has(o) && !e.shiftKey) drag = { type: "move", wx, wy, start: [...this.selection].map((s) => [s, s.x, s.y]), moved: false };
        else if (this.swipe || e.shiftKey) { drag = { type: "box", wx, wy, add: e.shiftKey }; this.box = [wx, wy, wx, wy]; }
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
      } else if (["pan", "tap", "tapdel"].includes(drag.type) || (drag.type === "tapsel" && !drag.o)) {
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
      else if (drag.type === "erase") { const o = this.renderer.objectAt(wx, wy); if (o) this.removeObjects([o]); }
      else if (drag.type === "box") { this.box[2] = wx; this.box[3] = wy; this.redraw(); }
      else if (drag.type === "move") {
        if (this.readOnly) return;
        let dx = wx - drag.wx, dy = wy - drag.wy;
        if (!e.altKey) { dx = Math.round(dx / GRID) * GRID; dy = Math.round(dy / GRID) * GRID; }
        if (!drag.moved) { drag.before = drag.start.map(([o]) => o.snapshot()); drag.moved = true; }
        for (const [o, x, y] of drag.start) { o.x = x + dx; o.y = y + dy; }
        this.markDirty();
      } else if (drag.type === "gizmo") {
        const [cx, cy] = drag.c;
        drag.objs.forEach((o, i) => o.restore(drag.start[i]));
        if (drag.k === "rot") {
          let deg = -((Math.atan2(wy - cy, wx - cx) - drag.a0) * 180) / Math.PI;
          if (!e.altKey) deg = Math.round(deg / 5) * 5;
          this.applyRotate(drag.objs, deg, cx, cy);
        } else if (drag.k === "scale") {
          let s = Math.hypot(wx - cx, wy - cy) / drag.d0;
          if (!e.altKey) s = Math.round(s * 20) / 20;
          for (const o of drag.objs) {
            o.sx = Math.max(0.05, o.sx * s); o.sy = Math.max(0.05, o.sy * s);
            if (drag.objs.length > 1) { o.x = cx + (o.x - cx) * s; o.y = cy + (o.y - cy) * s; }
          }
        } else {
          const ax = drag.k === "wx";
          let s = ax ? Math.abs(wx - cx) / drag.x0 : Math.abs(wy - cy) / drag.y0;
          if (!e.altKey) s = Math.round(s * 20) / 20;
          for (const o of drag.objs) { if (ax) o.sx = Math.max(0.05, o.sx * s); else o.sy = Math.max(0.05, o.sy * s); }
        }
        this.markDirty();
      }
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (!drag) return;
      if (drag.type === "tap") { this.preview = [snap(drag.wx), snap(drag.wy)]; this.redraw(); }
      else if (drag.type === "tapdel") { const o = this.renderer.objectAt(drag.wx, drag.wy); if (o) this.removeObjects([o]); }
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
      if (e.ctrlKey || e.metaKey || (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX))) {
        const [wx, wy] = this.renderer.screenToWorld(e.offsetX, e.offsetY);
        cam.zoom = Math.max(0.15, Math.min(6, cam.zoom * Math.exp(-e.deltaY * 0.0015)));
        const [nx, ny] = this.renderer.screenToWorld(e.offsetX, e.offsetY);
        cam.x += wx - nx; cam.y += wy - ny;
      } else cam.x += (e.deltaX || e.deltaY) / cam.zoom;
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
      if (k === "enter") { e.preventDefault(); return this.mainAction(); }
      if (k === "delete" || k === "backspace") return this.deleteSelected();
      if (k === "escape") { this.widget = null; return this.select([]); }
      const step = e.shiftKey && e.altKey ? 0.5 : e.shiftKey ? 2 : e.altKey ? 150 : 30;
      if (this.selection.size && this.mode !== "build") {
        if (k === "w") return this.moveSel(0, step);
        if (k === "s") return this.moveSel(0, -step);
        if (k === "a") return this.moveSel(-step, 0);
        if (k === "d") return this.moveSel(step, 0);
        if (k === "q") return this.rotateSel(e.shiftKey ? -45 : -90);
        if (k === "e") return this.rotateSel(e.shiftKey ? 45 : 90);
      } else if (this.mode === "build" && this.preview && ["w", "a", "s", "d"].includes(k)) {
        const d = { w: [0, step], s: [0, -step], a: [-step, 0], d: [step, 0] }[k];
        this.preview = [this.preview[0] + d[0], this.preview[1] + d[1]];
        return this.redraw();
      }
      const cam = this.renderer.cam;
      if (k === "arrowleft") { cam.x -= 180 / cam.zoom; this.redraw(); }
      if (k === "arrowright") { cam.x += 180 / cam.zoom; this.redraw(); }
      if (k === "arrowup") { cam.y += 120 / cam.zoom; this.redraw(); }
      if (k === "arrowdown") { cam.y -= 120 / cam.zoom; this.redraw(); }
    };
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    this.onResize = () => { this.renderer.resize(); this.redraw(); };
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
    this.afterSelection();
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
    this.afterSelection();
  }
  modify(objs, fn) {
    if (!this.guard() || !objs.length) return;
    const before = objs.map((o) => o.snapshot());
    objs.forEach(fn);
    this.pushHistory({ type: "modify", objs, before, after: objs.map((o) => o.snapshot()) });
  }

  placeAt(wx, wy, painting, force = false) {
    if (!this.guard()) return;
    const x = snap(wx), y = snap(wy);
    this.preview = [x, y];
    const exists = this.level.objects.find((o) => o.id === this.current && o.x === x && o.y === y);
    if (exists && painting) return;
    if (exists && !force) { this.select([exists]); return; }
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

  select(list) { this.selection = new Set(list); this.afterSelection(); this.redraw(); }
  afterSelection() {
    if (!this.actionBtn) return;
    this.renderAction();
    if (this.mode !== "build") this.renderContent();
  }
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
    toast(`Copied ${objs.length}`);
  }
  paste() {
    if (!this.clipboard.length) return toast("Clipboard is empty");
    const list = this.clipboard.map((o) => o.clone());
    this.addObjects(list);
    this.select(list);
  }

  // ================= popups =================
  popup(titleStr, body, actions = []) {
    let close;
    const p = panel("", h("div", { class: "center" }, text(titleStr, { font: "goldFont", size: 32, align: "center" })), body,
      h("div", { class: "row center", style: { marginTop: "14px" } }, ...actions, btn("OK", () => close(), { small: true })));
    close = modal(p, { onClose: () => { this.redraw(); if (this.mode !== "build") this.renderContent(); } });
    return close;
  }
  field(label, input) { return h("label", { class: "ed-field" }, h("span", null, label), input); }

  rawPopup(o) {
    const ta = h("textarea", { class: "gd-input", style: { width: "100%", minHeight: "160px", fontFamily: "monospace" } }, Object.entries(o.props).map(([k, v]) => `${k},${v}`).join("\n"));
    this.popup(`Object ${o.id} properties`, h("div", { class: "col" }, h("div", { class: "small muted" }, "One key,value per line (position, rotation, groups and colors are edited in the menu)."), ta),
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
    const set = (k, v) => { if (!this.guard()) return; hd[k] = String(v); this.markDirty(); if (k === "kA6" || k === "kA7") this.renderer.loadBackgrounds(); };
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
        h("div", { class: "small muted center", style: { maxWidth: "440px" } }, "Build: tap to move the preview, then Place (or Enter / double-click). Swipe paints. Edit: tap to select, drag to move, Shift+drag box select. Keys: 1/2/3 modes · WASD move (Shift small, Shift+Alt tiny, Alt 5 blocks) · Q/E rotate · Ctrl+C/V/D · Ctrl+Z/Y · Ctrl+S save · Space or right-drag to pan · wheel zoom")));
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
