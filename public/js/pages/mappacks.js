import { h, api, go } from "../core.js";
import { text } from "../gd.js";
import { backButton, spinner, errorPanel, pager, table, difficultyFace, btn } from "../ui.js";

const DIFF_FACE = ["auto", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10"];

export default async function mappacks(app, _p, query) {
  const page = +(query.page || 0);
  app.append(backButton("/"), h("div", { class: "center" }, text("Map Packs", { font: "goldFont", size: 44 })));
  const box = h("div", { class: "col", style: { alignItems: "center", width: "100%" } }, spinner());
  app.append(box);
  try {
    const d = await api(`/mappacks?page=${page}`);
    const pages = Math.ceil((d.total || 0) / (d.pageSize || 10));
    box.replaceChildren(pager(page, pages, (p) => go(`/mappacks?page=${p}`)),
      table(d.packs.map((p) => h("div", { class: "gd-cell" },
        difficultyFace({ face: DIFF_FACE[p.difficulty] || "00", difficulty: "", stars: p.stars, coins: 0 }),
        h("div", { class: "info" },
          text(p.name, { font: "bigFont", size: 26, color: p.textColor ? `#${p.textColor.split(",").map((n) => (+n).toString(16).padStart(2, "0")).join("")}` : "" }),
          h("div", { class: "small" }, `${p.levels.length} levels · ${p.stars} stars · ${p.coins} coins`)),
        btn("View", () => go(`/search?type=10&str=${p.levels.join(",")}`), { small: true })))));
  } catch (e) { box.replaceChildren(errorPanel(e)); }
}
