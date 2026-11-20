import { h, api, go } from "../core.js";
import { sprite, text } from "../gd.js";
import { panel, btn, backButton, spinner, table, levelCell, pager, errorPanel } from "../ui.js";

const TYPES = { 0: "Search", 1: "Most Downloaded", 2: "Most Liked", 3: "Trending", 4: "Recent", 5: "User Levels", 6: "Featured", 7: "Magic", 10: "Map Pack", 11: "Awarded", 13: "Friends", 16: "Hall of Fame", 17: "World Featured", 19: "Unknown", 21: "Daily Safe", 22: "Weekly Safe", 23: "Event Safe", 25: "List", 27: "Sent" };
const DIFFS = [["-1", "N/A", "00"], ["1", "Easy", "01"], ["2", "Normal", "02"], ["3", "Hard", "03"], ["4", "Harder", "04"], ["5", "Insane", "05"], ["-2", "Demon", "06"], ["-3", "Auto", "auto"]];
const LENS = ["Tiny", "Short", "Medium", "Long", "XL", "Plat."];

export default async function search(app, _parts, query) {
  const q = { type: 0, page: 0, ...query };
  app.append(backButton("/"));
  const header = text(q.gauntlet ? "Gauntlet" : TYPES[q.type] || "Levels", { font: "goldFont", size: 42, align: "center" });
  const results = h("div", { class: "col", style: { alignItems: "center", width: "100%" } });

  const set = (patch) => {
    const n = { ...q, ...patch };
    for (const k of Object.keys(n)) if (n[k] === "" || n[k] === undefined || n[k] === null) delete n[k];
    go(`/search?${new URLSearchParams(n)}`);
  };

  const diffs = new Set(String(q.diff || "").split(",").filter((x) => x && x !== "-"));
  const lens = new Set(String(q.len || "").split(",").filter((x) => x && x !== "-"));
  const filters = h("div", { class: "col" },
    h("form", { class: "row", onsubmit: (e) => { e.preventDefault(); set({ str: e.target.str.value.trim(), type: e.target.str.value.trim() ? 0 : q.type, page: 0 }); } },
      h("input", { class: "gd-input grow", name: "str", value: q.str || "", placeholder: "Level name or ID" }),
      btn("Search", null, { small: true })),
    h("div", { class: "row center" }, DIFFS.map(([v, name, face]) => {
      const b = h("button", { class: `icon-btn ${diffs.has(v) ? "" : "dim"}`, title: name, style: { opacity: diffs.has(v) || !diffs.size ? 1 : 0.4 }, onclick: () => {
        if (diffs.has(v)) diffs.delete(v); else { if (v === "-2" || v === "-3" || [...diffs].some((d) => d === "-2" || d === "-3")) diffs.clear(); diffs.add(v); }
        set({ diff: [...diffs].join(",") || undefined, page: 0 });
      } }, sprite(face === "auto" ? "difficulty_auto_btn_001.png" : `difficulty_${face}_btn_001.png`, { style: { height: "46px" } }), h("span", { class: "fallback gd-btn sm" }, name));
      return b;
    })),
    h("div", { class: "row center" }, LENS.map((name, i) => btn(name, () => {
      if (lens.has(String(i))) lens.delete(String(i)); else lens.add(String(i));
      set({ len: [...lens].join(",") || undefined, page: 0 });
    }, { small: true, color: lens.has(String(i)) ? "" : "grey" })),
    ...[["star", "Rated"], ["featured", "Featured"], ["epic", "Epic"], ["legendary", "Legendary"], ["mythic", "Mythic"], ["coins", "Coins"], ["twoPlayer", "2-Player"], ["original", "Original"]].map(([k, name]) =>
      btn(name, () => set({ [k]: q[k] ? undefined : 1, page: 0 }), { small: true, color: q[k] ? "cyan" : "grey" }))));

  app.append(h("div", { class: "center" }, header), panel("", filters), results);

  results.append(spinner());
  try {
    const params = new URLSearchParams(q);
    if (q.diff?.includes("-2")) { params.set("diff", "-2"); }
    if (q.diff?.includes("-3")) { params.set("diff", "-3"); }
    const data = await api(`/search?${params}`);
    results.replaceChildren();
    if (!data.levels.length) {
      results.append(panel("", h("div", { class: "center" }, text("No levels found", { font: "bigFont", size: 26 }))));
      return;
    }
    const pages = data.total ? Math.ceil(data.total / (data.pageSize || 10)) : 0;
    results.append(
      pager(+q.page, pages, (p) => set({ page: p })),
      table(data.levels.map(levelCell)),
      pager(+q.page, pages, (p) => set({ page: p })));
  } catch (e) {
    results.replaceChildren(errorPanel(e));
  }
}
