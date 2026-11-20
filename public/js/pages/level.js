// GD LevelInfoLayer + InfoLayer (description & comments popup)
import { h, api, go, fmt, state, toast } from "../core.js";
import { sprite, text, iconCanvas, ICON_TYPE_FORM } from "../gd.js";
import { panel, btn, backButton, spinner, difficultyFace, songLabel, errorPanel, spriteBtn, modal, darkBox, closeButton, chat } from "../ui.js";

export default async function levelPage(app, [id]) {
  app.append(backButton(-1));
  const holder = h("div", { class: "level-info" }, spinner());
  app.append(holder);
  let level;
  try { level = await api(`/level/${encodeURIComponent(id)}`); } catch (e) { holder.replaceChildren(errorPanel(e)); return; }
  const special = ["daily", "weekly", "event"].includes(id);
  const statRow = (icon, val) => h("div", { class: "li-stat" }, sprite(icon), text(String(val), { font: "bigFont", size: 22 }));
  const play = spriteBtn("GJ_playBtn2_001.png", level.copyable || level.mine ? "Open" : "View", () => go(`/editor/online/${level.id}`), { height: 150 });
  play.title = level.copyable || level.mine ? "Open in editor" : "View in editor (read-only)";

  holder.replaceChildren(
    h("div", { class: "li-title" },
      special ? text(`${id[0].toUpperCase()}${id.slice(1)} Level`, { font: "goldFont", size: 20 }) : null,
      text(level.name, { font: "bigFont", size: 48, align: "center" }),
      level.author ? h("a", { href: `#/profile/${encodeURIComponent(level.author)}` }, text(`By ${level.author}`, { font: "goldFont", size: 26 })) : null),
    h("div", { class: "li-main" },
      difficultyFace(level, 110),
      play,
      h("div", { class: "li-stats" },
        statRow("GJ_downloadsIcon_001.png", fmt(level.downloads)),
        statRow(level.likes < 0 ? "GJ_dislikesIcon_001.png" : "GJ_likesIcon_001.png", fmt(level.likes)),
        statRow("GJ_timeIcon_001.png", level.length))),
    darkBox(h("div", { class: "li-song" },
      sprite("GJ_noteIcon_001.png", { style: { height: "34px" } }),
      h("div", { class: "col", style: { gap: "2px" } },
        text(songLabel(level), { font: "bigFont", size: 20, color: "#fa6eff" }),
        level.song?.artist ? text(`By: ${level.song.artist}`, { font: "goldFont", size: 15 }) : null,
        level.song?.size ? text(`SongID: ${level.customSong}  Size: ${level.song.size}`, { font: "bigFont", size: 11 }) : null),
      level.song?.url ? h("a", { href: level.song.url, target: "_blank", rel: "noopener" }, sprite("GJ_playMusicBtn_001.png", { style: { height: "44px" } })) : null)),
    h("div", { class: "li-side right" },
      spriteBtn("GJ_infoBtn_001.png", "Info", () => infoLayer(level), { height: 54 }),
      level.accountID ? spriteBtn("GJ_profileButton_001.png", "Creator", () => go(`/profile/${encodeURIComponent(level.author)}`), { height: 54 }) : null),
    h("div", { class: "li-side left" },
      spriteBtn("GJ_duplicateBtn_001.png", "Clone", () => go(`/editor/online/${level.id}`), { height: 54 })),
    h("div", { class: "li-id" }, text(`ID: ${level.id}${level.copyable ? (level.password ? `  Password: ${level.password}` : "  Free to copy") : ""}`, { font: "goldFont", size: 14 })));
}

function infoLayer(level) {
  let close;
  const p = panel("info-layer",
    closeButton(() => close()),
    h("div", { class: "center" }, text(level.name, { font: "bigFont", size: 30, align: "center" })),
    level.author ? h("div", { class: "center" }, text(`By ${level.author}`, { font: "goldFont", size: 20 })) : null,
    darkBox(h("div", { class: "center" }, chat(level.description || "(No description provided)", { wrap: 600, align: "center", size: 19 }))),
    h("div", { class: "small center muted" }, `Uploaded: ${level.uploaded || "?"} ago · Updated: ${level.updated || "?"} ago · Version ${level.version}${level.objects ? ` · ${fmt(level.objects)} objects` : ""}`),
    commentsSection(level.id));
  close = modal(p);
}

export function commentsSection(levelID) {
  let page = 0, top = false;
  const list = h("div", { class: "comment-list" });
  const head = h("div", { class: "row", style: { justifyContent: "space-between" } });
  const me = state.status?.me;
  const form = me ? h("form", { class: "row", onsubmit: async (e) => {
    e.preventDefault();
    const t = e.target.c.value.trim();
    if (!t) return;
    try { await api("/comment", { json: { levelID, text: t, percent: +e.target.p.value || 0 } }); toast("Comment uploaded!", "ok"); e.target.c.value = ""; load(); } catch (err) { toast(err.message, "error"); }
  } }, h("input", { class: "gd-input grow", name: "c", maxlength: 100, placeholder: "Add a comment" }),
  h("input", { class: "gd-input", name: "p", type: "number", min: 0, max: 100, placeholder: "%", style: { width: "70px" } }),
  btn("Post", null, { small: true })) : null;
  async function load() {
    head.replaceChildren(text("Comments", { font: "goldFont", size: 24 }), h("div", { class: "row" },
      btn("Recent", () => { top = false; page = 0; load(); }, { small: true, color: top ? "grey" : "" }),
      btn("Top", () => { top = true; page = 0; load(); }, { small: true, color: top ? "" : "grey" })));
    list.replaceChildren(spinner());
    try {
      const d = await api(`/comments/${levelID}?page=${page}${top ? "&top=1" : ""}`);
      list.replaceChildren();
      if (!d.comments.length) list.append(h("div", { class: "comment empty" }, text("No comments", { font: "bigFont", size: 18 })));
      d.comments.forEach((c) => list.append(commentRow(c)));
      const pages = Math.ceil((d.total || 0) / (d.pageSize || 20));
      if (pages > 1) list.append(h("div", { class: "row center" },
        page > 0 ? btn("<", () => { page--; load(); }, { small: true }) : null, text(`${page + 1} / ${pages}`, { font: "goldFont", size: 16 }),
        page < pages - 1 ? btn(">", () => { page++; load(); }, { small: true }) : null));
    } catch (e) { list.replaceChildren(h("p", { class: "center" }, e.message)); }
  }
  load();
  return h("div", { class: "col" }, head, form, list);
}

// GD CommentCell
export function commentRow(c) {
  const u = c.user;
  return h("div", { class: "comment" },
    u ? iconCanvas({ form: ICON_TYPE_FORM[u.iconType] || "cube", id: u.icon || 1, col1: u.col1, col2: u.col2, glow: u.glow }, 38) : null,
    h("div", { class: "body" },
      h("div", { class: "meta" },
        u ? h("a", { href: `#/profile/${encodeURIComponent(u.username)}` }, text(u.username, { font: "goldFont", size: 18 })) : null,
        c.percent ? text(`${c.percent}%`, { font: "bigFont", size: 13 }) : null),
      chat(c.text, { wrap: 520, color: c.modColor ? `#${c.modColor.split(",").map((n) => (+n).toString(16).padStart(2, "0")).join("")}` : undefined })),
    h("div", { class: "comment-right" },
      text(c.age ? `${c.age} ago` : "", { font: "chatFont", size: 15, color: "#000000" }),
      h("span", { class: "stat" }, sprite(c.likes < 0 ? "GJ_dislikesIcon_001.png" : "GJ_likesIcon_001.png", { style: { height: "18px" } }), text(String(c.likes), { font: "bigFont", size: 14 }))));
}
