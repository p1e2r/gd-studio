import { h, api, store, toast, state, download, go } from "../core.js";
import { text, drawIcon, playerColors, FORMS, sprite } from "../gd.js";
import { panel, btn, backButton } from "../ui.js";

const FORM_TAB_ICON = { cube: "gj_iconBtn_off_001.png", ship: "gj_shipBtn_off_001.png", ball: "gj_ballBtn_off_001.png", ufo: "gj_birdBtn_off_001.png", wave: "gj_dartBtn_off_001.png", robot: "gj_robotBtn_off_001.png", spider: "gj_spiderBtn_off_001.png", swing: "gj_swingBtn_off_001.png", jetpack: "gj_jetpackBtn_off_001.png" };

export const defaultKit = () => ({ form: "cube", icons: Object.fromEntries(FORMS.map((f) => [f, 1])), col1: 0, col2: 3, col3: 3, glow: false });
export const loadKit = () => ({ ...defaultKit(), ...store.get("iconkit", {}) });

export default async function iconkit(app, _p, query) {
  const kit = loadKit();
  const counts = await api("/icons/forms").catch(() => ({}));
  const colors = await playerColors();
  let colorSlot = "col1";

  if (query.u) {
    try {
      const u = await api(`/profile/${encodeURIComponent(query.u)}`);
      Object.assign(kit, { icons: { ...kit.icons, ...u.icons }, col1: u.col1, col2: u.col2, col3: u.col3, glow: u.glow });
      toast(`Loaded ${u.username}'s icons`, "ok");
    } catch (e) { toast(e.message, "error"); }
  }
  const save = () => store.set("iconkit", kit);

  // big preview
  const preview = h("canvas", { width: 360, height: 360, class: "preview", style: { width: "180px", height: "180px", background: "none" } });
  async function drawPreview() {
    const ctx = preview.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 360, 360);
    ctx.translate(180, 180);
    const ok = await drawIcon(ctx, { form: kit.form, id: kit.icons[kit.form], col1: kit.col1, col2: kit.col2, col3: kit.col3, glow: kit.glow, unit: 360 / 48 });
    if (!ok) { ctx.fillStyle = "#fff"; ctx.font = "20px sans-serif"; ctx.textAlign = "center"; ctx.fillText("icon assets missing", 0, 0); }
  }

  const tabs = h("div", { class: "kit-tabs" });
  const grid = h("div", { class: "kit-grid" });
  const swatches = h("div", { class: "swatches" });
  const slotBtns = h("div", { class: "row center" });
  const glowToggle = h("label", { class: "check" }, h("input", { type: "checkbox", checked: kit.glow, onchange: (e) => { kit.glow = e.target.checked; save(); drawPreview(); } }), h("span", { class: "box" }), text("Glow", { font: "bigFont", size: 18 }));

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const c = e.target;
      io.unobserve(c);
      const ctx = c.getContext("2d");
      ctx.translate(48, 48);
      drawIcon(ctx, { form: c.dataset.form, id: +c.dataset.id, col1: kit.col1, col2: kit.col2, col3: kit.col3, glow: false, unit: 96 / 50 });
    }
  }, { root: grid });

  function renderTabs() {
    tabs.replaceChildren(...FORMS.map((f) => h("button", { class: f === kit.form ? "sel" : "", title: f, onclick: () => { kit.form = f; save(); renderTabs(); renderGrid(); drawPreview(); } },
      sprite(FORM_TAB_ICON[f], { style: { height: "36px" } }), h("div", { class: "small" }, `${f} (${counts[f] || 0})`))));
  }
  function renderGrid() {
    io.disconnect();
    const n = counts[kit.form] || 0;
    grid.replaceChildren();
    if (!n) { grid.append(h("p", { class: "small" }, "No icons found in your Resources/icons folder for this form.")); return; }
    for (let i = 1; i <= n; i++) {
      const c = h("canvas", { width: 96, height: 96, style: { width: "48px", height: "48px" }, "data-form": kit.form, "data-id": i });
      const b = h("button", { class: kit.icons[kit.form] === i ? "sel" : "", title: `#${i}`, onclick: () => {
        kit.icons[kit.form] = i; save();
        grid.querySelectorAll("button.sel").forEach((x) => x.classList.remove("sel"));
        b.classList.add("sel"); drawPreview();
      } }, c);
      grid.append(b);
      io.observe(c);
    }
  }
  function renderSwatches() {
    slotBtns.replaceChildren(...[["col1", "Col 1"], ["col2", "Col 2"], ["col3", "Glow"]].map(([k, l]) => btn(l, () => { colorSlot = k; renderSwatches(); }, { small: true, color: colorSlot === k ? "" : "grey" })));
    swatches.replaceChildren(...colors.map((c, i) => c && h("button", {
      class: kit.col1 === i || kit.col2 === i || kit.col3 === i ? "sel" : "",
      "data-tag": [kit.col1 === i ? "1" : "", kit.col2 === i ? "2" : "", kit.col3 === i ? "G" : ""].join(""),
      title: `#${i} rgb(${c.join(",")})`, style: { background: `rgb(${c.join(",")})` },
      onclick: () => { kit[colorSlot] = i; save(); renderSwatches(); drawPreview(); renderGrid(); },
    })).filter(Boolean));
  }

  const lookup = h("form", { class: "row", onsubmit: (e) => { e.preventDefault(); const v = e.target.u.value.trim(); if (v) go(`/iconkit?u=${encodeURIComponent(v)}&t=${Date.now()}`); } },
    h("input", { class: "gd-input grow", name: "u", placeholder: "Load icons from a player", value: query.u || "" }), btn("Load", null, { small: true }));

  const actions = h("div", { class: "row center" },
    btn("Download PNG", () => preview.toBlob((b) => download(`${kit.form}_${kit.icons[kit.form]}.png`, b)), { small: true }),
    btn("Apply to Save File", () => { save(); go("/save?applyIcons=1"); }, { small: true, color: "pink" }),
    state.status?.me ? btn("Apply to Account", async () => {
      if (!state.status.features.scoreUpload) { toast("Disabled on this server. Use Apply to Save File, or set ENABLE_SCORE_UPLOAD=true (experimental).", "error"); return; }
      if (!confirm("This re-uploads your stats with the new icons, like the game does. It's experimental: a bad upload can get you flagged on leaderboards. Continue?")) return;
      try {
        await api("/update-icons", { json: { icons: kit.icons, col1: kit.col1, col2: kit.col2, col3: kit.col3, glow: kit.glow, icon: kit.icons[kit.form], iconType: FORMS.indexOf(kit.form) } });
        toast("Icons updated on your account", "ok");
      } catch (e) { toast(e.message, "error"); }
    }, { small: true, color: "grey" }) : null);

  app.append(backButton("/"),
    h("div", { class: "center" }, text("Icon Kit", { font: "goldFont", size: 44 })),
    h("div", { class: "kit" },
      panel("", lookup, h("div", { class: "kit-preview" }, preview), actions),
      panel("", tabs, grid),
      panel("", slotBtns, swatches, h("div", { class: "row center", style: { marginTop: "8px" } }, glowToggle))));
  renderTabs(); renderGrid(); renderSwatches(); drawPreview();
  return { destroy: () => io.disconnect() };
}
