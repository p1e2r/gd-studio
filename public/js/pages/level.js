import { h, api, go, fmt, state, toast } from "../core.js";
import { sprite, text, iconCanvas, ICON_TYPE_FORM } from "../gd.js";
import { panel, btn, backButton, spinner, difficultyFace, songLabel, stat, errorPanel, pager } from "../ui.js";

export default async function levelPage(app, [id], query) {
  app.append(backButton(-1));
  const holder = h("div", { class: "col", style: { alignItems: "center", width: "100%" } }, spinner());
  app.append(holder);
  let level;
  try {
    level = await api(`/level/${encodeURIComponent(id)}`);
  } catch (e) {
    holder.replaceChildren(errorPanel(e));
    return;
  }
  const isSpecial = ["daily", "weekly", "event"].includes(id);
  const copyText = level.mine ? "Your level" : level.copyable ? (level.password ? `Copyable (password ${level.password})` : "Free to copy") : "Not copyable";

  const info = panel("",
    h("div", { class: "col", style: { alignItems: "center", textAlign: "center" } },
      isSpecial ? text(`${id[0].toUpperCase()}${id.slice(1)} Level${level.dailyNumber ? ` #${level.dailyNumber % 100000}` : ""}`, { font: "goldFont", size: 24 }) : null,
      text(level.name, { font: "bigFont", size: 44, align: "center" }),
      level.author ? h("a", { href: `#/profile/${encodeURIComponent(level.author)}` }, text(`By ${level.author}`, { font: "goldFont", size: 26 })) : null,
      h("div", { class: "row center", style: { gap: "30px", margin: "10px 0" } },
        difficultyFace(level, 96),
        h("div", { class: "col", style: { alignItems: "flex-start" } },
          stat("GJ_downloadsIcon_001.png", fmt(level.downloads), "Downloads"),
          stat(level.likes < 0 ? "GJ_dislikesIcon_001.png" : "GJ_likesIcon_001.png", fmt(level.likes), "Likes"),
          stat("GJ_timeIcon_001.png", level.length, "Length"),
          level.objects ? h("span", { class: "small" }, `${fmt(level.objects)} objects`) : null)),
      h("div", { class: "chat", style: { maxWidth: "640px" } }, level.description || "(No description provided)"),
      h("div", { class: "small", style: { color: "#ff9cf6", marginTop: "6px" } }, songLabel(level),
        level.song?.url ? [" — ", h("a", { href: level.song.url, target: "_blank", rel: "noopener" }, "listen")] : null),
      h("div", { class: "small muted" }, `ID ${level.id} · v${level.version} · ${copyText}${level.uploaded ? ` · uploaded ${level.uploaded} ago` : ""}${level.updated ? ` · updated ${level.updated} ago` : ""}${level.twoPlayer ? " · 2-player" : ""}${level.ldm ? " · LDM" : ""}`),
      h("div", { class: "row center", style: { marginTop: "12px" } },
        btn(level.copyable || level.mine ? "Open in Editor" : "View in Editor", () => go(`/editor/online/${level.id}`), { color: "cyan" }),
        level.accountID ? btn("Creator", () => go(`/profile/${encodeURIComponent(level.author)}`), { color: "grey", small: true }) : null)));

  holder.replaceChildren(info);
  holder.append(commentsSection(level.id, query));
}

export function commentsSection(levelID, query = {}) {
  let page = +(query.cpage || 0);
  let top = !!query.top;
  const list = h("div", { class: "col", style: { gap: 0 } });
  const head = h("div", { class: "row", style: { justifyContent: "space-between" } });
  const wrap = panel("", head, list);

  const me = state.status?.me;
  const form = me ? h("form", { class: "row", onsubmit: async (e) => {
    e.preventDefault();
    const t = e.target.c.value.trim();
    if (!t) return;
    try {
      await api("/comment", { json: { levelID, text: t, percent: +e.target.p.value || 0 } });
      toast("Comment posted", "ok");
      e.target.c.value = "";
      load();
    } catch (err) { toast(err.message, "error"); }
  } },
  h("input", { class: "gd-input grow", name: "c", maxlength: 100, placeholder: `Comment as ${me.username}` }),
  h("input", { class: "gd-input", name: "p", type: "number", min: 0, max: 100, placeholder: "%", style: { width: "80px" } }),
  btn("Post", null, { small: true })) : h("div", { class: "small muted" }, h("a", { href: "#/login" }, "Log in"), " to comment.");

  async function load() {
    head.replaceChildren(text("Comments", { font: "goldFont", size: 28 }),
      h("div", { class: "row" }, btn("Recent", () => { top = false; page = 0; load(); }, { small: true, color: top ? "grey" : "" }),
        btn("Top", () => { top = true; page = 0; load(); }, { small: true, color: top ? "" : "grey" })));
    list.replaceChildren(spinner());
    try {
      const data = await api(`/comments/${levelID}?page=${page}${top ? "&top=1" : ""}`);
      list.replaceChildren(form);
      if (!data.comments.length) list.append(h("p", { class: "center muted" }, "No comments yet."));
      for (const c of data.comments) list.append(commentRow(c));
      const pages = Math.ceil((data.total || 0) / (data.pageSize || 20));
      if (pages > 1) list.append(pager(page, pages, (p) => { page = p; load(); }));
    } catch (e) {
      list.replaceChildren(h("p", { class: "center" }, e.message));
    }
  }
  load();
  return wrap;
}

export function commentRow(c) {
  const u = c.user;
  return h("div", { class: "comment" },
    u ? iconCanvas({ form: ICON_TYPE_FORM[u.iconType] || "cube", id: u.icon || 1, col1: u.col1, col2: u.col2, glow: u.glow }, 44) : null,
    h("div", { class: "body" },
      h("div", { class: "meta" },
        u ? h("a", { href: `#/profile/${encodeURIComponent(u.username)}` }, text(u.username, { font: "goldFont", size: 18 })) : null,
        c.percent ? h("span", null, `${c.percent}%`) : null,
        h("span", { class: "muted" }, c.age ? `${c.age} ago` : "")),
      h("div", { class: "chat", style: c.modColor ? { color: `rgb(${c.modColor})` } : undefined }, c.text),
      h("div", { class: "meta" }, sprite(c.likes < 0 ? "GJ_dislikesIcon_001.png" : "GJ_likesIcon_001.png", { style: { height: "16px" } }), String(c.likes), c.levelID ? h("a", { href: `#/level/${c.levelID}` }, `level ${c.levelID}`) : null)));
}
