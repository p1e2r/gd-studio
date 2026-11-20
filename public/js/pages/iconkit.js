// GD GJGarageLayer: icon pages, form tabs, paint button -> color page
import { h, api, store, toast, state, download, go } from "../core.js";
import { text, drawIcon, playerColors, FORMS, sprite } from "../gd.js";
import { panel, btn, backButton, spriteBtn, modal, closeButton, darkBox } from "../ui.js";

const TAB = { cube: "gj_iconBtn", ship: "gj_shipBtn", ball: "gj_ballBtn", ufo: "gj_birdBtn", wave: "gj_dartBtn", robot: "gj_robotBtn", spider: "gj_spiderBtn", swing: "gj_swingBtn", jetpack: "gj_jetpackBtn" };
const PER_PAGE = 36;

export const defaultKit = () => ({ form: "cube", icons: Object.fromEntries(FORMS.map((f) => [f, 1])), col1: 0, col2: 3, col3: 3, glow: false });
export const loadKit = () => ({ ...defaultKit(), ...store.get("iconkit", {}) });

export default async function iconkit(app, _p, query) {
  const kit = loadKit();
  const counts = await api("/icons/forms").catch(() => ({}));
  let playerName = state.status?.me?.username || "Player";
  if (query.u) {
    try {
      const u = await api(`/profile/${encodeURIComponent(query.u)}`);
      Object.assign(kit, { icons: { ...kit.icons, ...u.icons }, col1: u.col1, col2: u.col2, col3: u.col3, glow: u.glow });
      playerName = u.username;
      toast(`Loaded ${u.username}'s icons`, "ok");
    } catch (e) { toast(e.message, "error"); }
  }
  const save = () => store.set("iconkit", kit);
  let page = Math.floor(((kit.icons[kit.form] || 1) - 1) / PER_PAGE);

  const preview = h("canvas", { width: 300, height: 300, style: { width: "120px", height: "120px" } });
  async function drawPreview() {
    const ctx = preview.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 300, 300);
    ctx.translate(150, 150);
    await drawIcon(ctx, { form: kit.form, id: kit.icons[kit.form], col1: kit.col1, col2: kit.col2, col3: kit.col3, glow: kit.glow, unit: 300 / 44 });
  }

  const grid = h("div", { class: "garage-grid" });
  const tabs = h("div", { class: "garage-tabs" });
  const dots = h("div", { class: "ge-dots" });
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const ctx = e.target.getContext("2d");
      ctx.translate(48, 48);
      drawIcon(ctx, { form: e.target.dataset.form, id: +e.target.dataset.id, col1: kit.col1, col2: kit.col2, col3: kit.col3, glow: false, unit: 96 / 46 });
    }
  });
  function renderTabs() {
    tabs.replaceChildren(...FORMS.map((f) => h("button", { class: "garage-tab", title: f, onclick: () => { kit.form = f; page = Math.floor(((kit.icons[f] || 1) - 1) / PER_PAGE); save(); renderTabs(); renderGrid(); drawPreview(); } },
      sprite(`${TAB[f]}_${f === kit.form ? "on" : "off"}_001.png`), h("span", { class: "fallback" }, f))));
  }
  function renderGrid() {
    io.disconnect();
    const n = counts[kit.form] || 0;
    const pages = Math.max(1, Math.ceil(n / PER_PAGE));
    page = Math.max(0, Math.min(page, pages - 1));
    grid.replaceChildren();
    if (!n) grid.append(h("div", { class: "center small", style: { gridColumn: "1 / -1" } }, "No icons found in your Resources/icons folder for this form."));
    for (let i = page * PER_PAGE + 1; i <= Math.min(n, (page + 1) * PER_PAGE); i++) {
      const c = h("canvas", { width: 96, height: 96, "data-form": kit.form, "data-id": i });
      const b = h("button", { class: `garage-icon ${kit.icons[kit.form] === i ? "sel" : ""}`, title: `#${i}`, onclick: () => {
        kit.icons[kit.form] = i; save();
        grid.querySelectorAll(".sel").forEach((x) => x.classList.remove("sel"));
        b.classList.add("sel"); drawPreview();
      } }, c);
      grid.append(b);
      io.observe(c);
    }
    dots.replaceChildren(...(pages > 1 ? Array.from({ length: pages }, (_, i) => h("span", { class: `ge-dot ${i === page ? "on" : ""}` })) : []));
  }
  const arrow = (d) => {
    const b = spriteBtn("GJ_arrow_01_001.png", d < 0 ? "<" : ">", () => { page += d; renderGrid(); }, { height: 56 });
    if (d > 0) b.querySelector("img").style.transform = "scaleX(-1)";
    return b;
  };

  async function colorPage() {
    const colors = await playerColors();
    let close;
    const rows = h("div", { class: "col" });
    const render = () => {
      rows.replaceChildren(...[["col1", "Col 1"], ["col2", "Col 2"], ["col3", "Glow"]].map(([k, label]) => h("div", { class: "col", style: { gap: "4px" } },
        text(label, { font: "goldFont", size: 20 }),
        h("div", { class: "swatches" }, colors.map((c, i) => c && h("button", {
          class: kit[k] === i ? "sel" : "", "data-tag": kit[k] === i ? "✓" : "", title: `#${i}`, style: { background: `rgb(${c.join(",")})` },
          onclick: () => { kit[k] = i; save(); render(); drawPreview(); renderGrid(); },
        })).filter(Boolean)))),
      h("label", { class: "check center" }, h("input", { type: "checkbox", checked: kit.glow, onchange: (e) => { kit.glow = e.target.checked; save(); drawPreview(); } }), h("span", { class: "box" }), text("Glow", { font: "bigFont", size: 18 })));
    };
    render();
    close = modal(panel("", closeButton(() => close()), h("div", { class: "center" }, text("Colors", { font: "goldFont", size: 32 })), rows));
  }

  const lookup = h("form", { class: "row", onsubmit: (e) => { e.preventDefault(); const v = e.target.u.value.trim(); if (v) go(`/iconkit?u=${encodeURIComponent(v)}&t=${Date.now()}`); } },
    h("input", { class: "gd-input grow", name: "u", placeholder: "Load a player's icons" }), btn("Load", null, { small: true }));

  app.append(backButton("/"),
    h("div", { class: "garage" },
      h("div", { class: "garage-top" },
        text(playerName, { font: "goldFont", size: 30 }),
        h("div", { class: "garage-floor" }, preview)),
      h("div", { class: "garage-side" },
        spriteBtn("GJ_paintBtn_001.png", "Colors", colorPage, { height: 70 }),
        spriteBtn("GJ_downloadBtn_001.png", "PNG", () => preview.toBlob((b) => download(`${kit.form}_${kit.icons[kit.form]}.png`, b)), { height: 56 })),
      h("div", { class: "garage-box-row" }, arrow(-1), darkBox(grid), arrow(1)),
      dots, tabs,
      h("div", { class: "garage-actions" }, lookup,
        h("div", { class: "row center" },
          btn("Apply to Save File", () => { save(); go("/save?applyIcons=1"); }, { small: true, color: "pink" }),
          state.status?.me ? btn("Apply to Account", async () => {
            if (!state.status.features.scoreUpload) { toast("Disabled on this server (ENABLE_SCORE_UPLOAD). Use Apply to Save File.", "error"); return; }
            if (!confirm("This re-uploads your stats with the new icons. It's experimental and can get you flagged. Continue?")) return;
            try { await api("/update-icons", { json: { icons: kit.icons, col1: kit.col1, col2: kit.col2, col3: kit.col3, glow: kit.glow, icon: kit.icons[kit.form], iconType: FORMS.indexOf(kit.form) } }); toast("Icons updated", "ok"); } catch (e) { toast(e.message, "error"); }
          }, { small: true, color: "grey" }) : null))));
  renderTabs(); renderGrid(); drawPreview();
  return { destroy: () => io.disconnect() };
}
