// Canvas helpers shared by the comment / textbox / font generators.
import { loadImage, renderText, hexToRgb, gameAtlas } from "./gd.js";

export async function sliceImage(name) {
  return loadImage(`/sprite/${encodeURIComponent(name)}`).catch(() => null);
}

// 9-slice draw; corner = fraction of the source used for borders, dest border in px
export function nineSlice(ctx, img, x, y, w, hgt, border = 40, corner = 0.32) {
  if (!img) {
    ctx.fillStyle = "#bf6b30";
    roundRect(ctx, x, y, w, hgt, 24); ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = "#5a2d0f"; ctx.stroke();
    return;
  }
  const sw = img.width, sh = img.height;
  const cx = sw * corner, cy = sh * corner;
  const b = Math.min(border, w / 2, hgt / 2);
  const sx = [0, cx, sw - cx, sw], sy = [0, cy, sh - cy, sh];
  const dx = [x, x + b, x + w - b, x + w], dy = [y, y + b, y + hgt - b, y + hgt];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const s_w = sx[i + 1] - sx[i], s_h = sy[j + 1] - sy[j], d_w = dx[i + 1] - dx[i], d_h = dy[j + 1] - dy[j];
    if (s_w > 0 && s_h > 0 && d_w > 0 && d_h > 0) ctx.drawImage(img, sx[i], sy[j], s_w, s_h, dx[i], dy[j], d_w, d_h);
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Draw GD bitmap text: size = line height in px
export async function drawText(ctx, font, str, x, y, { size = 32, color, align = "left", wrap = 0, valign = "top" } = {}) {
  const probe = await renderText(font, "A", {});
  const ratio = probe.lineHeight / size;
  const r = await renderText(font, str, { color: typeof color === "string" ? hexToRgb(color) : color, align, wrap: wrap ? wrap * ratio : 0 });
  const k = size / r.lineHeight;
  const w = r.canvas.width * k, h = r.canvas.height * k;
  const dx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  const dy = valign === "middle" ? y - h / 2 : valign === "bottom" ? y - h : y;
  ctx.drawImage(r.canvas, dx, dy, w, h);
  return { w, h };
}

export async function drawFrame(ctx, name, x, y, height) {
  const atlas = await gameAtlas();
  const f = atlas.get(name);
  if (!f) return false;
  const w = (f.w / f.h) * height;
  ctx.drawImage(f.canvas, x - w / 2, y - height / 2, w, height);
  return true;
}
