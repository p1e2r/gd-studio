// GD LevelSearchLayer (no query) and LevelBrowserLayer (results)
import { h, api, go, state } from "../core.js";
import { sprite, text } from "../gd.js";
import { backButton, spinner, table, levelCell, pager, errorPanel, darkBox, spriteBtn } from "../ui.js";

const TYPES = { 0: "Search", 1: "Most Downloaded", 2: "Most Liked", 3: "Trending", 4: "Recent", 5: "User Levels", 6: "Featured", 7: "Magic", 10: "Map Pack", 11: "Awarded", 13: "Friends", 16: "Hall of Fame" };
const DIFFS = [["-1", "N/A", "00"], ["1", "Easy", "01"], ["2", "Normal", "02"], ["3", "Hard", "03"], ["4", "Harder", "04"], ["5", "Insane", "05"], ["-2", "Demon", "06"], ["-3", "Auto", "auto"]];
const LENS = ["Tiny", "Short", "Medium", "Long", "XL", "Plat"];
const QUICK = [
  [1, "Downloads", "GJ_sDownloadIcon_001.png"], [2, "Likes", "GJ_sLikeIcon_001.png"], [3, "Trending", "GJ_sTrendingIcon_001.png"],
  [4, "Recent", "GJ_sRecentIcon_001.png"], [7, "Magic", "GJ_sMagicIcon_001.png"], [11, "Awarded", "GJ_sStarsIcon_001.png"],
  [6, "Featured", "GJ_featuredIcon_001.png"], [16, "Hall of Fame", "GJ_epicCoin_001.png"], [13, "Friends", "GJ_sFriendsIcon_001.png"],
];

const filters = () => JSON.parse(sessionStorage.getItem("gds:filters") || "{}");
const saveFilters = (f) => sessionStorage.setItem("gds:filters", JSON.stringify(f));

export default async function search(app, _parts, query) {
  if (query.str === undefined && query.type === undefined && query.gauntlet === undefined) return searchLayer(app);
  return browser(app, query);
}

function searchLayer(app) {
  const f = filters();
  const diffs = new Set(f.diff || []);
  const lens = new Set(f.len || []);
  const input = h("input", { class: "gd-input search-input", placeholder: "Enter a level, user or ID", maxlength: 40 });
  const doSearch = (user) => {
    const v = input.value.trim();
    if (user) { if (v) go(`/profile/${encodeURIComponent(v)}`); return; }
    go(`/search?${new URLSearchParams({ str: v, type: 0, ...filterParams() })}`);
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(false); });
  const filterParams = () => {
    const p = {};
    const d = [...diffs];
    if (d.includes("-2")) p.diff = "-2"; else if (d.includes("-3")) p.diff = "-3"; else if (d.length) p.diff = d.join(",");
    if (lens.size) p.len = [...lens].join(",");
    for (const k of ["star", "featured", "epic", "coins", "twoPlayer", "original", "noStar"]) if (f[k]) p[k] = 1;
    return p;
  };
  const quick = darkBox(h("div", { class: "quick-grid" }, QUICK.filter(([t]) => t !== 13 || state.status?.me).map(([t, label, icon]) =>
    h("button", { class: "quick-btn", onclick: () => go(`/search?${new URLSearchParams({ type: t, ...filterParams() })}`) },
      sprite(icon, { class: "quick-ico" }), text(label, { font: "bigFont", size: 15 })))));

  const diffRow = h("div", { class: "filter-diffs" });
  const lenRow = h("div", { class: "filter-lens" });
  const optRow = h("div", { class: "filter-opts" });
  const renderFilters = () => {
    saveFilters({ ...f, diff: [...diffs], len: [...lens] });
    diffRow.replaceChildren(...DIFFS.map(([v, name, face]) => h("button", { class: `diff-toggle ${diffs.has(v) ? "on" : ""}`, title: name, onclick: () => {
      if (diffs.has(v)) diffs.delete(v); else { if (["-2", "-3"].includes(v) || [...diffs].some((d) => ["-2", "-3"].includes(d))) diffs.clear(); diffs.add(v); }
      renderFilters();
    } }, sprite(face === "auto" ? "diffIcon_auto_btn_001.png" : `diffIcon_${face}_btn_001.png`))));
    lenRow.replaceChildren(...LENS.map((name, i) => h("button", { class: `len-toggle ${lens.has(String(i)) ? "on" : ""}`, onclick: () => {
      if (lens.has(String(i))) lens.delete(String(i)); else lens.add(String(i));
      renderFilters();
    } }, text(name, { font: "bigFont", size: 15 }))));
    optRow.replaceChildren(...[["star", "Star"], ["noStar", "No Star"], ["featured", "Featured"], ["epic", "Epic"], ["coins", "Coins"], ["twoPlayer", "2-Player"], ["original", "Original"]].map(([k, l]) =>
      h("button", { class: `len-toggle ${f[k] ? "on" : ""}`, onclick: () => { f[k] = !f[k]; renderFilters(); } }, text(l, { font: "bigFont", size: 13 }))));
  };
  renderFilters();

  app.append(backButton("/creator"), h("div", { class: "search-layer" },
    darkBox(h("div", { class: "row" }, input,
      spriteBtn("gj_findBtn_001.png", "Search", () => doSearch(false), { height: 46 }),
      spriteBtn("GJ_longBtn05_001.png", "Users", () => doSearch(true), { height: 46 }))),
    h("div", { class: "center" }, text("Quick Search", { font: "goldFont", size: 26 })),
    quick,
    h("div", { class: "center" }, text("Filters", { font: "goldFont", size: 26 })),
    darkBox(diffRow, lenRow, optRow,
      h("div", { class: "row center" }, h("button", { class: "len-toggle", onclick: () => { diffs.clear(); lens.clear(); for (const k of Object.keys(f)) f[k] = false; renderFilters(); } }, text("Clear", { font: "bigFont", size: 14 }))))));
}

async function browser(app, query) {
  const q = { page: 0, ...query };
  const set = (patch) => {
    const n = { ...q, ...patch };
    for (const k of Object.keys(n)) if (n[k] === "" || n[k] === undefined || n[k] === null) delete n[k];
    go(`/search?${new URLSearchParams(n)}`);
  };
  const titleStr = q.gauntlet ? "Gauntlet" : q.str && +q.type === 0 ? `Search` : TYPES[q.type] || "Levels";
  app.append(backButton("/search"));
  const holder = h("div", { class: "col", style: { alignItems: "center", width: "100%" } }, spinner());
  app.append(holder);
  try {
    const data = await api(`/search?${new URLSearchParams(q)}`);
    if (!data.levels.length) {
      holder.replaceChildren(table([h("div", { class: "gd-cell empty" }, text("No levels found", { font: "bigFont", size: 22 }))], { title: titleStr }));
      return;
    }
    const pages = data.total ? Math.ceil(data.total / (data.pageSize || 10)) : 0;
    holder.replaceChildren(
      pager(+q.page, pages, (p) => set({ page: p }), { total: data.total, pageSize: data.pageSize || 10 }),
      table(data.levels.map(levelCell), { title: titleStr, height: "calc(100vh - 230px)" }));
  } catch (e) {
    holder.replaceChildren(errorPanel(e));
  }
}
