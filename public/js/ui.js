// Shared widgets that mirror Geometry Dash's own UI components (sprites come from the user's GD install)
import { h, go, fmt } from "./core.js";
import { sprite, text } from "./gd.js";

export function panel(color = "", ...children) {
  return h("section", { class: `gd-panel ${color}` }, ...children);
}

export function title(str, size = 40, font = "goldFont") {
  return h("div", { class: "title-row" }, text(str, { font, size, align: "center" }));
}

// GJ_button_01 ButtonSprite with bigFont label
export function btn(label, onClick, { color = "", small = false, font = "bigFont", size, disabled } = {}) {
  return h("button", { class: `gd-btn ${color} ${small ? "sm" : ""}`, onclick: onClick, disabled },
    typeof label === "string" ? text(label, { font, size: size || (small ? 18 : 22) }) : label);
}

// A sprite used as a button (GD's CCMenuItemSpriteExtra), with a text fallback if the frame is missing.
export function spriteBtn(frame, label, onClick, { height, cls = "" } = {}) {
  const img = sprite(frame, { style: height ? { height: `${height}px` } : undefined });
  return h("button", { class: `icon-btn ${cls}`, title: label, "aria-label": label, onclick: onClick }, img,
    h("span", { class: "fallback gd-btn sm" }, text(label, { font: "bigFont", size: 16 })));
}

export function backButton(to = "/") {
  const b = spriteBtn("GJ_arrow_01_001.png", "Back", () => (to === -1 ? history.back() : go(to)), { height: 54 });
  b.classList.add("back-btn");
  return b;
}

export function closeButton(onClick) {
  const b = spriteBtn("GJ_closeBtn_001.png", "Close", onClick, { height: 44 });
  b.classList.add("close-btn");
  return b;
}

export function spinner() {
  return h("div", { class: "gd-loading" }, h("div", { class: "spinner" }));
}

export function stat(icon, value, titleStr, size = 16) {
  return h("span", { class: "stat", title: titleStr }, sprite(icon, { style: { height: `${size + 4}px` } }), text(String(value), { font: "bigFont", size }));
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
    level.stars ? h("span", { class: "stat" }, text(String(level.stars), { font: "bigFont", size: Math.round(size / 4.2) }), sprite(level.platformer ? "GJ_moonsIcon_001.png" : "star_small01_001.png", { style: { height: `${Math.round(size / 4)}px` } })) : null,
    level.coins ? h("span", { class: "stat coins" }, ...Array.from({ length: level.coins }, () => sprite(level.verifiedCoins ? "usercoin_small01_001.png" : "usercoin_small02_001.png", { style: { height: `${Math.round(size / 4.4)}px` } }))) : null);
}

export const OFFICIAL_SONGS = ["Stereo Madness", "Back On Track", "Polargeist", "Dry Out", "Base After Base", "Cant Let Go", "Jumper", "Time Machine", "Cycles", "xStep", "Clutterfunk", "Theory of Everything", "Electroman Adventures", "Clubstep", "Electrodynamix", "Hexagon Force", "Blast Processing", "Theory of Everything 2", "Geometrical Dominator", "Deadlocked", "Fingerdash", "Dash"];

export function songLabel(level) {
  if (level.song?.name) return level.song.name;
  if (level.customSong) return `Song ${level.customSong}`;
  return OFFICIAL_SONGS[level.officialSong ?? level.song?.official ?? 0] || "Official song";
}

// GD LevelCell
export function levelCell(level) {
  return h("div", { class: "gd-cell" },
    difficultyFace(level, 62),
    h("div", { class: "info" },
      text(level.name, { font: "bigFont", size: 24 }),
      level.author ? h("a", { href: `#/profile/${encodeURIComponent(level.author)}` }, text(`By ${level.author}`, { font: "goldFont", size: 18 })) : text("By -", { font: "goldFont", size: 18 }),
      text(songLabel(level), { font: "bigFont", size: 13, color: "#fa6eff" }),
      h("div", { class: "stats" },
        stat("GJ_timeIcon_001.png", level.length, "Length", 13),
        stat("GJ_downloadsIcon_001.png", fmt(level.downloads), "Downloads", 13),
        stat(level.likes < 0 ? "GJ_dislikesIcon_001.png" : "GJ_likesIcon_001.png", fmt(level.likes), "Likes", 13))),
    btn("View", () => go(`/level/${level.id}`), { small: true }));
}

// GJListLayer: GJ_table_top / side / bottom frame around a brown scrolling list
export function table(rows, { title: titleStr = "", height } = {}) {
  const body = h("div", { class: "gd-list-body", style: height ? { maxHeight: height } : undefined }, rows);
  return h("div", { class: "gd-list" },
    h("div", { class: "gd-list-top" }, sprite("GJ_table_top_001.png", { class: "cap" }), titleStr ? h("div", { class: "gd-list-title" }, text(titleStr, { font: "bigFont", size: 24 })) : null),
    h("div", { class: "gd-list-mid" }, h("div", { class: "gd-list-side l" }), body, h("div", { class: "gd-list-side r" })),
    sprite("GJ_table_bottom_001.png", { class: "cap bottom" }));
}

// Big page arrows at the screen edges (LevelBrowserLayer) + "1 to 10 of N" counter
export function pager(page, totalPages, onPage, { total, pageSize = 10 } = {}) {
  const left = spriteBtn("GJ_arrow_03_001.png", "Prev", () => onPage(page - 1), { height: 70 });
  const right = spriteBtn("GJ_arrow_03_001.png", "Next", () => onPage(page + 1), { height: 70 });
  left.classList.add("page-arrow", "left"); right.classList.add("page-arrow", "right");
  if (page <= 0) left.style.visibility = "hidden";
  if (totalPages && page >= totalPages - 1) right.style.visibility = "hidden";
  const from = page * pageSize + 1;
  const counter = total ? text(`${from} to ${Math.min(total, from + pageSize - 1)} of ${total}`, { font: "goldFont", size: 16 }) : text(`Page ${page + 1}`, { font: "goldFont", size: 16 });
  return h("div", { class: "pager" }, left, right, h("div", { class: "page-counter" }, counter));
}

export function modal(content, { onClose } = {}) {
  const bg = h("div", { class: "modal-bg", onclick: (e) => { if (e.target === bg) close(); } });
  const close = () => { bg.remove(); onClose?.(); };
  bg.append(content);
  document.body.append(bg);
  return close;
}

// FLAlertLayer-style popup: GJ_square01, goldFont title, OK button
export function alert(titleStr, body, { okText = "OK", onOk } = {}) {
  let close;
  const p = panel("", h("div", { class: "center" }, text(titleStr, { font: "goldFont", size: 30, align: "center" })),
    typeof body === "string" ? h("div", { class: "chat center", style: { margin: "10px 0" } }, body) : body,
    h("div", { class: "row center" }, btn(okText, () => { close(); onOk?.(); }, { small: true })));
  p.classList.add("alert");
  close = modal(p);
  return close;
}

// GD chatFont paragraph (wraps at wrap px)
export function chat(str, { wrap = 560, color, align = "left", size = 17 } = {}) {
  return h("div", { class: "chat" }, text(str, { font: "chatFont", size, wrap, color, align }), h("span", { class: "sr" }, str));
}

export function darkBox(...children) { return h("div", { class: "gd-box" }, ...children); }

export function errorPanel(err) {
  return panel("", title("Something went wrong", 30, "bigFont"), h("p", { class: "center chat" }, err.message || String(err)));
}
