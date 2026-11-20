import { h, api, go, fmt, state } from "../core.js";
import { sprite, text, iconCanvas, ICON_TYPE_FORM } from "../gd.js";
import { btn, backButton, spinner, table, errorPanel } from "../ui.js";

export default async function leaderboard(app, _p, query) {
  const type = query.type || "top";
  app.append(backButton("/"),
    h("div", { class: "center" }, text("Leaderboards", { font: "goldFont", size: 44 })),
    h("div", { class: "row center" },
      btn("Top 100", () => go("/leaderboard?type=top"), { small: true, color: type === "top" ? "" : "grey" }),
      btn("Creators", () => go("/leaderboard?type=creators"), { small: true, color: type === "creators" ? "" : "grey" }),
      state.status?.me ? btn("Global (me)", () => go("/leaderboard?type=relative"), { small: true, color: type === "relative" ? "" : "grey" }) : null,
      state.status?.me ? btn("Friends", () => go("/leaderboard?type=friends"), { small: true, color: type === "friends" ? "" : "grey" }) : null));
  const box = h("div", { class: "col", style: { alignItems: "center", width: "100%" } }, spinner());
  app.append(box);
  try {
    const users = await api(`/leaderboard?type=${type}`);
    box.replaceChildren(table(users.map((u, i) => h("div", { class: "gd-cell", style: { minHeight: "70px", cursor: "pointer" }, onclick: () => go(`/profile/${encodeURIComponent(u.username)}`) },
      text(String(u.rank || i + 1), { font: "goldFont", size: 26 }),
      iconCanvas({ form: ICON_TYPE_FORM[u.iconType] || "cube", id: u.icon || 1, col1: u.col1, col2: u.col2, glow: u.glow }, 46),
      h("div", { class: "info" }, text(u.username, { font: "bigFont", size: 24 })),
      h("div", { class: "stats" },
        type === "creators"
          ? h("span", { class: "stat" }, text(fmt(u.creatorPoints), { font: "bigFont", size: 18 }), sprite("GJ_hammerIcon_001.png"))
          : [h("span", { class: "stat" }, text(fmt(u.stars), { font: "bigFont", size: 18 }), sprite("GJ_starsIcon_001.png")),
            h("span", { class: "stat" }, text(fmt(u.moons), { font: "bigFont", size: 18 }), sprite("GJ_moonsIcon_001.png")),
            h("span", { class: "stat" }, text(fmt(u.demons), { font: "bigFont", size: 18 }), sprite("GJ_demonIcon_001.png"))])))));
  } catch (e) { box.replaceChildren(errorPanel(e)); }
}
