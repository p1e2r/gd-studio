import { h, api, go, fmt, state, toast } from "../core.js";
import { sprite, text, iconCanvas, FORMS } from "../gd.js";
import { panel, btn, backButton, spinner, errorPanel, table, levelCell, pager } from "../ui.js";
import { commentRow } from "./level.js";

export default async function profile(app, [name]) {
  app.append(backButton(-1));
  const holder = h("div", { class: "col", style: { alignItems: "center", width: "100%" } }, spinner());
  app.append(holder);
  let u;
  try { u = await api(`/profile/${encodeURIComponent(name)}`); } catch (e) { holder.replaceChildren(errorPanel(e)); return; }

  const icons = FORMS.map((form) => iconCanvas({ form, id: u.icons?.[form] || 1, col1: u.col1, col2: u.col2, col3: u.col3, glow: u.glow }, form === "robot" || form === "spider" ? 70 : 58));
  const links = [
    u.youtube && ["YouTube", u.youtube.startsWith("UC") ? `https://youtube.com/channel/${u.youtube}` : `https://youtube.com/@${u.youtube}`],
    u.twitter && ["X / Twitter", `https://x.com/${u.twitter}`],
    u.twitch && ["Twitch", `https://twitch.tv/${u.twitch}`],
  ].filter(Boolean);

  const s = (icon, v, t) => h("span", { class: "stat", title: t }, text(fmt(v), { font: "bigFont", size: 24 }), sprite(icon));
  holder.replaceChildren(panel("",
    h("div", { class: "col", style: { alignItems: "center" } },
      text(u.username || name, { font: "bigFont", size: 48, align: "center" }),
      u.mod ? text(u.mod === "elder" ? "Elder Moderator" : "Moderator", { font: "goldFont", size: 20 }) : null,
      u.rank ? text(`Global rank #${u.rank}`, { font: "goldFont", size: 20 }) : null,
      u.unregistered ? h("p", { class: "muted" }, "Unregistered player (green user) — limited info.") : null,
      h("div", { class: "stat-row" },
        s("GJ_starsIcon_001.png", u.stars, "Stars"), s("GJ_moonsIcon_001.png", u.moons, "Moons"),
        s("GJ_diamondsIcon_001.png", u.diamonds, "Diamonds"), s("GJ_coinsIcon_001.png", u.coins, "Secret coins"),
        s("GJ_coinsIcon2_001.png", u.userCoins, "User coins"), s("GJ_demonIcon_001.png", u.demons, "Demons"),
        u.creatorPoints ? s("GJ_hammerIcon_001.png", u.creatorPoints, "Creator points") : null),
      h("div", { class: "icon-row", style: { margin: "12px 0" } }, icons),
      h("div", { class: "row center" },
        btn("Icon Kit", () => go(`/iconkit?u=${encodeURIComponent(u.username)}`), { small: true, color: "cyan" }),
        u.playerID ? btn("Levels", () => go(`/search?type=5&str=${u.playerID}`), { small: true }) : null,
        ...links.map(([l, url]) => h("a", { href: url, target: "_blank", rel: "noopener" }, btn(l, null, { small: true, color: "grey" })))))));

  if (u.accountID) holder.append(postsSection(u));
  if (u.playerID) holder.append(levelsSection(u));
}

function postsSection(u) {
  let page = 0;
  const list = h("div", { class: "col", style: { gap: 0 } });
  const me = state.status?.me;
  const form = me && me.accountID === u.accountID ? h("form", { class: "row", onsubmit: async (e) => {
    e.preventDefault();
    try { await api("/post", { json: { text: e.target.t.value } }); toast("Posted", "ok"); e.target.t.value = ""; load(); } catch (err) { toast(err.message, "error"); }
  } }, h("input", { class: "gd-input grow", name: "t", maxlength: 190, placeholder: "New profile post" }), btn("Post", null, { small: true })) : null;
  async function load() {
    list.replaceChildren(spinner());
    try {
      const d = await api(`/profile/${u.accountID}/posts?page=${page}`);
      list.replaceChildren(...(form ? [form] : []));
      if (!d.comments.length) list.append(h("p", { class: "center muted" }, "No posts."));
      d.comments.forEach((c) => list.append(commentRow(c)));
      const pages = Math.ceil((d.total || 0) / (d.pageSize || 10));
      if (pages > 1) list.append(pager(page, pages, (p) => { page = p; load(); }));
    } catch (e) { list.replaceChildren(h("p", null, e.message)); }
  }
  load();
  return panel("", text("Profile Posts", { font: "goldFont", size: 28 }), list);
}

function levelsSection(u) {
  const box = h("div", { class: "col", style: { alignItems: "center", width: "100%" } }, spinner());
  api(`/search?type=5&str=${u.playerID}`).then((d) => {
    box.replaceChildren(text("Levels", { font: "goldFont", size: 32 }));
    if (!d.levels.length) box.append(h("p", { class: "muted" }, "No levels."));
    else box.append(table(d.levels.slice(0, 10).map(levelCell)), btn("All levels", () => go(`/search?type=5&str=${u.playerID}`), { small: true }));
  }).catch(() => box.replaceChildren());
  return box;
}
