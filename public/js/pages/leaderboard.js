// GD LeaderboardsLayer: side tabs + framed list
import { h, api, go, fmt, state } from "../core.js";
import { sprite, text, iconCanvas, ICON_TYPE_FORM } from "../gd.js";
import { backButton, spinner, table, errorPanel } from "../ui.js";

const TABS = [["top", "top_tab", "Top 100"], ["friends", "friends_tab", "Friends"], ["relative", "global_tab", "Global"], ["creators", "creators_tab", "Creators"]];

export default async function leaderboard(app, _p, query) {
  const type = query.type || "top";
  const tabs = h("div", { class: "lb-tabs" }, TABS.filter(([t]) => state.status?.me || (t !== "friends" && t !== "relative")).map(([t, fr, label]) =>
    h("button", { class: "lb-tab", title: label, onclick: () => go(`/leaderboard?type=${t}`) }, sprite(`${fr}_${t === type ? "on" : "off"}_001.png`), h("span", { class: "fallback" }, label))));
  const box = h("div", { class: "col", style: { alignItems: "center", width: "100%" } }, spinner());
  app.append(backButton("/creator"), h("div", { class: "lb-layer" }, tabs, box));
  const title = TABS.find(([t]) => t === type)?.[2] || "Top 100";
  try {
    const users = await api(`/leaderboard?type=${type}`);
    const st = (icon, v) => h("span", { class: "stat" }, text(fmt(v), { font: "bigFont", size: 14 }), sprite(icon, { style: { height: "18px" } }));
    box.replaceChildren(table(users.map((u, i) => h("div", { class: "gd-cell lb-cell", onclick: () => go(`/profile/${encodeURIComponent(u.username)}`) },
      text(String(u.rank || i + 1), { font: "goldFont", size: u.rank > 999 ? 16 : 22 }),
      iconCanvas({ form: ICON_TYPE_FORM[u.iconType] || "cube", id: u.icon || 1, col1: u.col1, col2: u.col2, glow: u.glow }, 42),
      h("div", { class: "info" }, text(u.username, { font: "bigFont", size: 22 })),
      h("div", { class: "stats" },
        type === "creators" ? st("GJ_hammerIcon_001.png", u.creatorPoints) : [
          st("GJ_starsIcon_001.png", u.stars), st("GJ_moonsIcon_001.png", u.moons), st("GJ_diamondsIcon_001.png", u.diamonds),
          st("GJ_coinsIcon_001.png", u.coins), st("GJ_coinsIcon2_001.png", u.userCoins), st("GJ_demonIcon_001.png", u.demons)]))), { title, height: "calc(100vh - 170px)" }));
  } catch (e) { box.replaceChildren(errorPanel(e)); }
}
