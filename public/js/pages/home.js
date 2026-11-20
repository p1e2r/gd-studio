import { h, state, go, api, toast } from "../core.js";
import { sprite, text } from "../gd.js";
import { panel, btn } from "../ui.js";
import { refreshStatus } from "../app.js";

const TILES = [
  ["Search", "/search", "gj_findBtn_001.png"],
  ["Featured", "/search?type=6", "GJ_featuredCoin_001.png"],
  ["Trending", "/search?type=3", "GJ_likesIcon_001.png"],
  ["Recent", "/search?type=4", "GJ_timeIcon_001.png"],
  ["Most Liked", "/search?type=2", "GJ_likesIcon_001.png"],
  ["Most Downloaded", "/search?type=1", "GJ_downloadsIcon_001.png"],
  ["Hall of Fame", "/search?type=16", "GJ_epicCoin_001.png"],
  ["Daily", "/level/daily", "GJ_dailyBtn_001.png"],
  ["Weekly", "/level/weekly", "GJ_weeklyBtn_001.png"],
  ["Gauntlets", "/gauntlets", "island_fire_001.png"],
  ["Map Packs", "/mappacks", "GJ_mapPacksBtn_001.png"],
  ["Leaderboards", "/leaderboard", "GJ_levelLeaderboardBtn_001.png"],
  ["Icon Kit", "/iconkit", "GJ_garageBtn_001.png"],
  ["Level Editor", "/editor", "GJ_createBtn_001.png"],
  ["Save Explorer", "/save", "GJ_downloadBtn_001.png"],
  ["Comment Gen", "/comment", "GJ_chatBtn_001.png"],
  ["Textbox Gen", "/textbox", "GJ_infoIcon_001.png"],
  ["Font Gen", "/font", "GJ_infoBtn_001.png"],
];

export default async function home(app) {
  const me = state.status?.me;
  const quick = h("form", { class: "row", style: { width: "100%" }, onsubmit: (e) => { e.preventDefault(); const v = e.target.q.value.trim(); if (v) go(`/search?str=${encodeURIComponent(v)}`); } },
    h("input", { class: "gd-input grow", name: "q", placeholder: "Search levels or enter a level ID" }),
    btn("Search", null, { small: true }));
  const userForm = h("form", { class: "row", style: { width: "100%" }, onsubmit: (e) => { e.preventDefault(); const v = e.target.u.value.trim(); if (v) go(`/profile/${encodeURIComponent(v)}`); } },
    h("input", { class: "gd-input grow", name: "u", placeholder: "Look up a player" }),
    btn("Profile", null, { small: true, color: "cyan" }));

  const account = me
    ? h("div", { class: "row center" }, text(`Logged in as ${me.username}`, { font: "goldFont", size: 22 }),
      btn("My Profile", () => go(`/profile/${encodeURIComponent(me.username)}`), { small: true, color: "cyan" }),
      btn("Log out", async () => { await api("/logout", { method: "POST" }); await refreshStatus(); toast("Logged out"); home(app.replaceChildren() || app); }, { small: true, color: "grey" }))
    : h("div", { class: "row center" }, btn("Log in", () => go("/login"), { small: true }), h("span", { class: "small muted" }, "to comment, upload levels and see your stats"));

  app.append(
    h("div", { class: "center", style: { marginTop: "18px" } }, text("GD Studio", { font: "goldFont", size: 64, align: "center" })),
    panel("", h("div", { class: "col" }, quick, userForm, account)),
    h("div", { class: "menu-grid" }, TILES.map(([label, to, icon]) =>
      h("a", { class: "menu-tile", href: `#${to}` }, sprite(icon), text(label, { font: "bigFont", size: 19, align: "center", wrap: 120 })))),
    h("p", { class: "small muted center" }, h("a", { href: "#/setup" }, "Setup")));
}
