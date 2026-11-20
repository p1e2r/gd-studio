// Shared GD-style widgets
import { h, go, fmt } from "./core.js";
import { sprite, text } from "./gd.js";

export function panel(color = "", ...children) {
  return h("section", { class: `gd-panel ${color}` }, ...children);
}

export function title(str, size = 40, font = "goldFont") {
  return h("div", { class: "title-row" }, text(str, { font, size, align: "center" }));
}

export function btn(label, onClick, { color = "", small = false, font = "bigFont", size, disabled } = {}) {
  return h("button", { class: `gd-btn ${color} ${small ? "sm" : ""}`, onclick: onClick, disabled },
    typeof label === "string" ? text(label, { font, size: size || (small ? 18 : 22) }) : label);
}

// Sprite button with text fallback if the frame isn't in the user's assets.
export function spriteBtn(frame, label, onClick, { height } = {}) {
  const img = sprite(frame, { style: height ? { height: `${height}px` } : undefined });
  return h("button", { class: "icon-btn", title: label, onclick: onClick }, img,
    h("span", { class: "fallback gd-btn sm" }, text(label, { font: "bigFont", size: 16 })));
}

export function backButton(to = "/") {
  const b = spriteBtn("GJ_arrow_01_001.png", "Back", () => (to === -1 ? history.back() : go(to)));
  b.classList.add("back-btn");
  return b;
}

export function spinner() { return h("div", { class: "spinner" }); }

export function stat(icon, value, title) {
  return h("span", { class: "stat", title }, sprite(icon), text(String(value), { font: "bigFont", size: 16 }));
}

export function difficultyFace(level, size = 66) {
  const face = level.face === "auto" ? "difficulty_auto_btn_001.png" : `difficulty_${level.face}_btn_001.png`;
  const coin = level.epic === 3 ? "GJ_epicCoin3_001.png" : level.epic === 2 ? "GJ_epicCoin2_001.png" : level.epic === 1 ? "GJ_epicCoin_001.png" : level.featured ? "GJ_featuredCoin_001.png" : null;
  const wrap = h("div", { class: "face-wrap", style: { width: `${size}px`, height: `${size}px` } });
  if (coin) wrap.append(sprite(coin, { class: "coin" }));
  const f = sprite(face, { class: "face" });
  f.addEventListener("error", () => wrap.replaceChildren(h("div", { class: "fallback-face" }, level.difficulty)), { once: true });
  wrap.append(f);
  return h("div", { class: "diff" }, wrap,
    level.stars ? h("span", { class: "stat" }, text(String(level.stars), { font: "bigFont", size: 15 }), sprite(level.platformer ? "GJ_moonsSmall_001.png" : "star_small01_001.png", { style: { height: "16px" } })) : null,
    level.coins ? h("span", { class: "stat" }, ...Array.from({ length: level.coins }, () => sprite(level.verifiedCoins ? "usercoin_small01_001.png" : "usercoin_small02_001.png", { style: { height: "16px" } }))) : null);
}

export function songLabel(level) {
  if (level.song?.name) return `${level.song.name} by ${level.song.artist || "?"}`;
  if (level.customSong) return `Song ${level.customSong}`;
  return OFFICIAL_SONGS[level.officialSong ?? level.song?.official ?? 0] || "Official song";
}

export const OFFICIAL_SONGS = ["Stereo Madness", "Back On Track", "Polargeist", "Dry Out", "Base After Base", "Cant Let Go", "Jumper", "Time Machine", "Cycles", "xStep", "Clutterfunk", "Theory of Everything", "Electroman Adventures", "Clubstep", "Electrodynamix", "Hexagon Force", "Blast Processing", "Theory of Everything 2", "Geometrical Dominator", "Deadlocked", "Fingerdash", "Dash"];

export function levelCell(level) {
  return h("div", { class: "gd-cell" },
    difficultyFace(level),
    h("div", { class: "info" },
      text(level.name, { font: "bigFont", size: 26 }),
      level.author ? h("a", { href: `#/profile/${encodeURIComponent(level.author)}`, onclick: (e) => e.stopPropagation() }, text(`By ${level.author}`, { font: "goldFont", size: 19 })) : null,
      h("div", { class: "small", style: { color: "#ff9cf6" } }, songLabel(level)),
      h("div", { class: "stats" },
        stat("GJ_timeIcon_001.png", level.length, "Length"),
        stat("GJ_downloadsIcon_001.png", fmt(level.downloads), "Downloads"),
        stat(level.likes < 0 ? "GJ_dislikesIcon_001.png" : "GJ_likesIcon_001.png", fmt(level.likes), "Likes"),
        level.objects ? h("span", { class: "small muted" }, `${fmt(level.objects)} objects`) : null)),
    btn("View", () => go(`/level/${level.id}`), { small: true }));
}

export function table(rows) {
  return h("div", { class: "gd-table" },
    sprite("GJ_table_top_001.png", { class: "cap" }),
    h("div", { class: "body" }, rows),
    sprite("GJ_table_bottom_001.png", { class: "cap" }));
}

export function pager(page, totalPages, onPage) {
  const left = spriteBtn("GJ_arrow_03_001.png", "Prev", () => onPage(page - 1));
  const right = spriteBtn("GJ_arrow_03_001.png", "Next", () => onPage(page + 1));
  left.classList.add("arrow"); right.classList.add("arrow", "right");
  if (page <= 0) left.style.visibility = "hidden";
  if (totalPages && page >= totalPages - 1) right.style.visibility = "hidden";
  return h("div", { class: "pager" }, left, text(`Page ${page + 1}${totalPages ? ` / ${totalPages}` : ""}`, { font: "goldFont", size: 22 }), right);
}

export function modal(content, { onClose } = {}) {
  const bg = h("div", { class: "modal-bg", onclick: (e) => { if (e.target === bg) close(); } });
  const close = () => { bg.remove(); onClose?.(); };
  bg.append(content);
  document.body.append(bg);
  return close;
}

export function errorPanel(err) {
  return panel("", title("Something went wrong", 30, "bigFont"), h("p", { class: "center" }, err.message || String(err)));
}
