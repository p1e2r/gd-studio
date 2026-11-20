// GD map packs list
import { h, api, go } from "../core.js";
import { sprite, text } from "../gd.js";
import { backButton, spinner, errorPanel, pager, table, btn } from "../ui.js";

const FACE = ["auto", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10"];

export default async function mappacks(app, _p, query) {
  const page = +(query.page || 0);
  app.append(backButton("/creator"));
  const box = h("div", { class: "col", style: { alignItems: "center", width: "100%" } }, spinner());
  app.append(box);
  try {
    const d = await api(`/mappacks?page=${page}`);
    const pages = Math.ceil((d.total || 0) / (d.pageSize || 10));
    const hex = (c) => (c ? `#${c.split(",").map((n) => (+n).toString(16).padStart(2, "0")).join("")}` : "#ffffff");
    box.replaceChildren(pager(page, pages, (p) => go(`/mappacks?page=${p}`), { total: d.total, pageSize: d.pageSize || 10 }),
      table(d.packs.map((p) => h("div", { class: "gd-cell" },
        h("div", { class: "diff" }, sprite(`difficulty_${FACE[p.difficulty] || "00"}_btn_001.png`, { style: { height: "56px" } })),
        h("div", { class: "info" },
          text(p.name, { font: "bigFont", size: 24, color: hex(p.textColor) }),
          h("div", { class: "stats" },
            h("span", { class: "stat" }, text(String(p.stars), { font: "bigFont", size: 15 }), sprite("GJ_starsIcon_001.png", { style: { height: "20px" } })),
            h("span", { class: "stat" }, text(String(p.coins), { font: "bigFont", size: 15 }), sprite("GJ_coinsIcon_001.png", { style: { height: "20px" } })),
            text(`${p.levels.length} levels`, { font: "bigFont", size: 13 })),
          h("div", { class: "pack-bar", style: { background: hex(p.barColor) } })),
        btn("View", () => go(`/search?type=10&str=${p.levels.join(",")}`), { small: true }))), { title: "Map Packs", height: "calc(100vh - 230px)" }));
  } catch (e) { box.replaceChildren(errorPanel(e)); }
}
