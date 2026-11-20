import { h, api, toast, download, pickFile, go, fmt } from "../core.js";
import { text, iconCanvas, FORMS } from "../gd.js";
import { panel, btn, backButton, spinner } from "../ui.js";
import { loadKit } from "./iconkit.js";

const STATS = {
  1: "Jumps", 2: "Attempts", 3: "Official levels beaten", 4: "Online levels beaten", 5: "Demons", 6: "Stars", 7: "Map packs", 8: "Secret coins",
  9: "Players destroyed", 10: "Levels liked/disliked", 11: "Levels rated", 12: "User coins", 13: "Diamonds", 14: "Orbs", 15: "Daily levels",
  16: "Fire shards", 17: "Ice shards", 18: "Poison shards", 19: "Shadow shards", 20: "Lava shards", 21: "Demon keys", 22: "Total orbs",
  23: "Earth shards", 24: "Blood shards", 25: "Metal shards", 26: "Light shards", 27: "Soul shards", 28: "Moons", 29: "Diamond shards", 40: "Gauntlets",
};
const ICON_KEYS = { cube: "playerFrame", ship: "playerShip", ball: "playerBall", ufo: "playerBird", wave: "playerDart", robot: "playerRobot", spider: "playerSpider", swing: "playerSwing", jetpack: "playerJetpack" };

export default async function savePage(app, _p, query) {
  let save = null; // {format, data, name}
  const out = h("div", { class: "col", style: { alignItems: "center", width: "100%" } });
  app.append(backButton("/"), h("div", { class: "center" }, text("Save Explorer", { font: "goldFont", size: 44 })),
    panel("",
      h("p", null, "Open ", h("b", null, "CCGameManager.dat"), " (stats, icons, settings) or ", h("b", null, "CCLocalLevels.dat"), " (your created levels). Windows and macOS saves both work."),
      h("ul", { class: "small" },
        h("li", null, "Windows: ", h("code", null, "%LOCALAPPDATA%\\GeometryDash")),
        h("li", null, "macOS: ", h("code", null, "~/Library/Application Support/GeometryDash"))),
      h("p", { class: "small muted" }, "Close Geometry Dash and back up your save before replacing it with an edited one. The file is decoded on this server and is not stored."),
      h("div", { class: "row center" }, btn("Open save file", async () => {
        const f = await pickFile(".dat");
        if (!f) return;
        out.replaceChildren(spinner());
        try {
          const r = await api("/save/decode", { method: "POST", body: f, headers: { "Content-Type": "application/octet-stream" } });
          save = { ...r, name: f.name };
          render();
        } catch (e) { out.replaceChildren(panel("", h("p", null, e.message))); }
      }))),
    out);

  function render() {
    const d = save.data;
    out.replaceChildren();
    if (d.LLM_01) out.append(localLevels(d));
    if (d.GS_value || d.playerName) out.append(gameManager(d));
    out.append(panel("", text("Raw data", { font: "goldFont", size: 26 }), searchTree(d)));
  }

  function gameManager(d) {
    const stats = d.GS_value || {};
    const kit = loadKit();
    const form = h("div", { class: "col" });
    const vals = {};
    const row = (label, key, val) => {
      const inp = h("input", { class: "gd-input", type: "number", value: val ?? "", style: { width: "120px" } });
      vals[key] = inp;
      return h("label", { class: "ed-field" }, h("span", null, label), inp);
    };
    for (const [f, k] of Object.entries(ICON_KEYS)) form.append(row(`${f} icon`, k, query.applyIcons ? kit.icons[f] : d[k]));
    form.append(row("Color 1", "playerColor", query.applyIcons ? kit.col1 : d.playerColor), row("Color 2", "playerColor2", query.applyIcons ? kit.col2 : d.playerColor2),
      row("Glow color", "playerColor3", query.applyIcons ? kit.col3 : d.playerColor3), row("Glow (1/0)", "playerGlow", query.applyIcons ? (kit.glow ? 1 : 0) : d.playerGlow ? 1 : 0),
      row("Icon type (0 cube … 8 jetpack)", "playerIconType", query.applyIcons ? FORMS.indexOf(kit.form) : d.playerIconType));
    const previewIcons = h("div", { class: "icon-row" }, FORMS.map((f) => iconCanvas({ form: f, id: +(d[ICON_KEYS[f]] || 1), col1: +(d.playerColor || 0), col2: +(d.playerColor2 || 3), col3: d.playerColor3 ?? null, glow: !!d.playerGlow }, 48)));
    return panel("",
      text(d.playerName || "Player", { font: "bigFont", size: 40 }),
      h("div", { class: "small muted" }, `${save.name} · ${save.format} save${d.GJA_001 ? ` · account ${d.GJA_001}` : ""}`),
      previewIcons,
      h("div", { class: "stat-row", style: { margin: "10px 0" } }, Object.entries(stats).filter(([k]) => STATS[k]).map(([k, v]) => h("div", { class: "col", style: { alignItems: "center", gap: "2px" } }, text(fmt(+v), { font: "bigFont", size: 22 }), h("span", { class: "small" }, STATS[k])))),
      text("Edit icons", { font: "goldFont", size: 26 }),
      query.applyIcons ? h("p", { class: "small" }, "Filled in from your Icon Kit selection.") : null,
      form,
      h("div", { class: "row center", style: { marginTop: "10px" } }, btn("Download edited save", async () => {
        const data = structuredClone(save.data);
        for (const [k, inp] of Object.entries(vals)) {
          if (inp.value === "") continue;
          if (k === "playerGlow") data[k] = inp.value === "1";
          else data[k] = Number(inp.value);
        }
        try {
          const blob = await api("/save/encode", { json: { data, format: save.format }, blob: true });
          download(save.name || "CCGameManager.dat", blob);
          toast("Downloaded. Replace your save while GD is closed (keep a backup!)", "ok");
        } catch (e) { toast(e.message, "error"); }
      }), btn("Open Icon Kit", () => go("/iconkit"), { small: true, color: "cyan" })));
  }

  function localLevels(d) {
    const levels = Object.values(d.LLM_01).filter((l) => l && typeof l === "object" && l.k2);
    return panel("", text(`Local levels (${levels.length})`, { font: "goldFont", size: 28 }),
      h("div", { class: "col", style: { gap: 0 } }, levels.map((l) => h("div", { class: "comment" },
        h("div", { class: "body" }, text(l.k2, { font: "bigFont", size: 22 }),
          h("div", { class: "small muted" }, [l.k1 ? `ID ${l.k1}` : "not uploaded", l.k16 ? `v${l.k16}` : null, l.k80 ? `${Math.round(l.k80 / 60)} min in editor` : null].filter(Boolean).join(" · "))),
        btn("Open in Editor", async () => {
          const raw = await api("/levelstring/decode", { method: "POST", body: l.k4 || "", headers: { "Content-Type": "text/plain" } });
          let desc = "";
          try { desc = atob(String(l.k3 || "").replace(/-/g, "+").replace(/_/g, "/")); } catch { /* none */ }
          const s = await api("/levels", { json: { name: l.k2, description: desc, data: raw, songID: l.k45 || 0, officialSong: l.k8 || 0, uploadedID: l.k1 || null } });
          go(`/editor/${s.id}`);
        }, { small: true }),
        btn(".gmd", async () => {
          const raw = await api("/levelstring/decode", { method: "POST", body: l.k4 || "", headers: { "Content-Type": "text/plain" } });
          const xml = await api("/gmd/encode", { json: { name: l.k2, data: raw, songID: l.k45, officialSong: l.k8 } });
          download(`${l.k2.replace(/[^\w -]/g, "")}.gmd`, xml, "application/xml");
        }, { small: true, color: "grey" })))));
  }
}

function searchTree(data) {
  const q = h("input", { class: "gd-input", placeholder: "Search keys/values", style: { width: "100%", marginBottom: "8px" } });
  const tree = h("div", { class: "tree" });
  const build = (obj, filter, depth = 0) => {
    const frag = [];
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === "object") {
        const inner = build(v, filter, depth + 1);
        if (filter && !inner.length && !k.toLowerCase().includes(filter)) continue;
        const det = h("details", { open: !!filter && depth < 3 }, h("summary", null, h("span", { class: "k" }, k), ` (${Object.keys(v).length})`));
        det.addEventListener("toggle", () => { if (det.open && det.children.length === 1) det.append(...build(v, filter, depth + 1)); }, { once: true });
        if (filter) det.append(...inner);
        frag.push(det);
      } else {
        const s = String(v);
        if (filter && !k.toLowerCase().includes(filter) && !s.toLowerCase().includes(filter)) continue;
        frag.push(h("div", { class: "kv" }, h("span", { class: "k" }, k), ": ", s.length > 200 ? `${s.slice(0, 200)}… (${s.length} chars)` : s));
      }
      if (frag.length > 800) break;
    }
    return frag;
  };
  const render = () => tree.replaceChildren(...build(data, q.value.trim().toLowerCase()));
  let t;
  q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(render, 250); });
  render();
  return h("div", null, q, tree);
}
