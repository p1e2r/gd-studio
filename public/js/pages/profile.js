// GD ProfilePage: big popup with stats, icons and profile posts
import { h, api, go, fmt, state, toast } from "../core.js";
import { sprite, text, iconCanvas, FORMS } from "../gd.js";
import { panel, btn, spinner, errorPanel, closeButton, darkBox, spriteBtn } from "../ui.js";
import { commentRow } from "./level.js";

export default async function profile(app, [name]) {
  const holder = h("div", { class: "profile-wrap" }, spinner());
  app.append(holder);
  let u;
  try { u = await api(`/profile/${encodeURIComponent(name)}`); } catch (e) { holder.replaceChildren(errorPanel(e)); return; }
  const s = (icon, v, t) => h("span", { class: "stat", title: t }, text(fmt(v), { font: "bigFont", size: 22 }), sprite(icon, { style: { height: "26px" } }));
  const icons = FORMS.map((form) => iconCanvas({ form, id: u.icons?.[form] || 1, col1: u.col1, col2: u.col2, col3: u.col3, glow: u.glow }, form === "robot" || form === "spider" ? 60 : 50));
  const links = [
    u.youtube && ["gj_ytIcon_001.png", u.youtube.startsWith("UC") ? `https://youtube.com/channel/${u.youtube}` : `https://youtube.com/@${u.youtube}`],
    u.twitter && ["gj_twIcon_001.png", `https://x.com/${u.twitter}`],
    u.twitch && ["gj_twitchIcon_001.png", `https://twitch.tv/${u.twitch}`],
  ].filter(Boolean);

  const posts = h("div", { class: "comment-list" }, spinner());
  holder.replaceChildren(panel("profile-page",
    closeButton(() => history.length > 1 ? history.back() : go("/")),
    h("div", { class: "center col", style: { gap: "2px" } },
      h("div", { class: "row center" },
        u.mod ? sprite(u.mod === "elder" ? "modBadge_02_001.png" : "modBadge_01_001.png", { style: { height: "34px" } }) : null,
        text(u.username || name, { font: "bigFont", size: 42, align: "center" })),
      u.rank ? h("div", { class: "row center" }, sprite("GJ_trophyIcon_001.png", { style: { height: "26px" } }), text(`Global Rank: ${u.rank}`, { font: "goldFont", size: 18 })) : null),
    darkBox(h("div", { class: "stat-row" },
      s("GJ_starsIcon_001.png", u.stars, "Stars"), s("GJ_moonsIcon_001.png", u.moons, "Moons"), s("GJ_diamondsIcon_001.png", u.diamonds, "Diamonds"),
      s("GJ_coinsIcon_001.png", u.coins, "Secret coins"), s("GJ_coinsIcon2_001.png", u.userCoins, "User coins"), s("GJ_demonIcon_001.png", u.demons, "Demons"),
      u.creatorPoints ? s("GJ_hammerIcon_001.png", u.creatorPoints, "Creator points") : null),
    h("div", { class: "icon-row" }, icons)),
    h("div", { class: "row center profile-actions" },
      ...links.map(([icon, url]) => h("a", { href: url, target: "_blank", rel: "noopener" }, sprite(icon, { style: { height: "40px" } }))),
      u.playerID ? spriteBtn("accountBtn_myLevels_001.png", "Levels", () => go(`/search?type=5&str=${u.playerID}`), { height: 52 }) : null,
      spriteBtn("GJ_garageBtn_001.png", "Icon Kit", () => go(`/iconkit?u=${encodeURIComponent(u.username)}`), { height: 52 })),
    u.unregistered ? h("p", { class: "center small" }, "Unregistered player — limited info.") : posts));
  if (!u.accountID) return;

  let page = 0;
  const me = state.status?.me;
  const form = me && me.accountID === u.accountID ? h("form", { class: "row", onsubmit: async (e) => {
    e.preventDefault();
    try { await api("/post", { json: { text: e.target.t.value } }); toast("Posted!", "ok"); e.target.t.value = ""; load(); } catch (err) { toast(err.message, "error"); }
  } }, h("input", { class: "gd-input grow", name: "t", maxlength: 190, placeholder: "New post" }), btn("Post", null, { small: true })) : null;
  async function load() {
    posts.replaceChildren(spinner());
    try {
      const d = await api(`/profile/${u.accountID}/posts?page=${page}`);
      posts.replaceChildren(...(form ? [form] : []));
      if (!d.comments.length) posts.append(h("div", { class: "comment empty" }, text(`${u.username} has no posts`, { font: "bigFont", size: 16 })));
      d.comments.forEach((c) => posts.append(commentRow(c)));
      const pages = Math.ceil((d.total || 0) / (d.pageSize || 10));
      if (pages > 1) posts.append(h("div", { class: "row center" },
        page > 0 ? btn("<", () => { page--; load(); }, { small: true }) : null, text(`${page + 1} / ${pages}`, { font: "goldFont", size: 16 }),
        page < pages - 1 ? btn(">", () => { page++; load(); }, { small: true }) : null));
    } catch (e) { posts.replaceChildren(h("p", null, e.message)); }
  }
  load();
}
