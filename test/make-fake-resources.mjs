// Generates a tiny synthetic "Resources" folder (placeholder art, NOT GD assets) for tests.
// Usage: node test/make-fake-resources.mjs <outDir>
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const out = process.argv[2] || "/tmp/fake-res";
fs.mkdirSync(path.join(out, "icons"), { recursive: true });
const objects = JSON.parse(fs.readFileSync(new URL("../data/objects.json", import.meta.url)));

const textures = new Set();
const walk = (o) => { if (o.texture && o.texture !== "emptyFrame.png") textures.add(o.texture); (o.children || []).forEach(walk); };
Object.values(objects).forEach(walk);

const hue = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

async function sheet(file, frames, cell = 62) {
  const cols = Math.ceil(Math.sqrt(frames.length));
  const W = cols * cell, H = Math.ceil(frames.length / cols) * cell;
  const comps = [];
  let plist = '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>frames</key><dict>';
  frames.forEach((f, i) => {
    const x = (i % cols) * cell, y = Math.floor(i / cols) * cell;
    const name = typeof f === "string" ? f : f.name;
    const w = f.w || cell - 2, h = f.h || cell - 2;
    const rotated = !!f.rotated;
    const grey = /_2_|glow|extra/.test(name) ? "#bbb" : "#fff";
    const svgW = rotated ? h : w, svgH = rotated ? w : h;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}"><rect x="1" y="1" width="${svgW - 2}" height="${svgH - 2}" rx="6" fill="${f.fill || grey}" stroke="hsl(${hue(name)},70%,35%)" stroke-width="4"/><text x="${svgW / 2}" y="${svgH / 2 + 4}" font-size="10" text-anchor="middle" fill="#000">${name.slice(0, 8)}</text></svg>`;
    comps.push({ input: Buffer.from(svg), left: x, top: y });
    plist += `<key>${name}</key><dict><key>textureRect</key><string>{{${x},${y}},{${w},${h}}}</string><key>textureRotated</key>${rotated ? "<true/>" : "<false/>"}<key>spriteOffset</key><string>{0,0}</string><key>spriteSourceSize</key><string>{${w},${h}}</string><key>spriteSize</key><string>{${w},${h}}</string></dict>`;
  });
  plist += "</dict><key>metadata</key><dict><key>format</key><integer>3</integer></dict></dict></plist>";
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png().toFile(path.join(out, `${file}-hd.png`));
  fs.writeFileSync(path.join(out, `${file}-hd.plist`), plist);
}

const ui = ["GJ_arrow_01_001.png", "GJ_arrow_02_001.png", "GJ_arrow_03_001.png", "GJ_sideArt_001.png", "GJ_starsIcon_001.png", "GJ_downloadsIcon_001.png", "GJ_likesIcon_001.png", "GJ_timeIcon_001.png",
  "GJ_featuredCoin_001.png", "GJ_epicCoin_001.png", "star_small01_001.png", "GJ_moonsIcon_001.png", "GJ_diamondsIcon_001.png", "GJ_coinsIcon_001.png", "GJ_demonIcon_001.png",
  "GJ_undoBtn_001.png", "GJ_redoBtn_001.png", "GJ_pauseEditorBtn_001.png", "dialogIcon_001.png", "dialogIcon_002.png",
  ...["00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "auto"].map((d) => `difficulty_${d}_btn_001.png`)];

await sheet("GJ_GameSheet", [...textures].filter((_, i) => i % 2 === 0).map((n, i) => (i === 0 ? { name: n, w: 40, h: 60, rotated: true } : n)));
await sheet("GJ_GameSheet02", [...textures].filter((_, i) => i % 2 === 1));
await sheet("GJ_GameSheet03", ui.map((n) => ({ name: n, fill: `hsl(${hue(n)},80%,60%)` })));

// icons
const icon = (pre) => [{ name: `${pre}_001.png`, w: 60, h: 60 }, { name: `${pre}_2_001.png`, w: 50, h: 50 }, { name: `${pre}_glow_001.png`, w: 64, h: 64 }];
for (let i = 1; i <= 3; i++) {
  const id = String(i).padStart(2, "0");
  await sheet(`icons/player_${id}`, icon(`player_${id}`), 66);
  await sheet(`icons/ship_${id}`, icon(`ship_${id}`), 66);
}

// standalone panels/buttons/backgrounds
const solid = async (name, w, h, fill, stroke) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="${Math.min(w, h) / 5}" fill="${fill}" stroke="${stroke}" stroke-width="6"/></svg>`)).png().toFile(path.join(out, `${name}-hd.png`));
await solid("GJ_square01", 160, 160, "#c06c34", "#5b2c0e");
await solid("GJ_square02", 160, 160, "#2140a8", "#0d1a4d");
await solid("GJ_square03", 160, 160, "#2f8a2a", "#103d0e");
await solid("GJ_square04", 160, 160, "#7b2fa8", "#2c0e4d");
await solid("GJ_square05", 160, 160, "#333", "#111");
for (let i = 1; i <= 6; i++) await solid(`GJ_button_0${i}`, 80, 80, ["#5fd62a", "#29c7d6", "#d62ab0", "#999", "#2a5ad6", "#d62a2a"][i - 1], "#000");
await solid("game_bg_01_001", 512, 512, "#bbbbbb", "#999");
await solid("groundSquare_01_001", 256, 256, "#cccccc", "#888");

// bitmap fonts
async function font(name, fill) {
  const cw = 32, ch = 44, cols = 16;
  const chars = []; for (let c = 32; c < 127; c++) chars.push(c);
  const W = cols * cw, H = Math.ceil(chars.length / cols) * ch;
  const comps = chars.map((c, i) => {
    const t = String.fromCharCode(c).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    return { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}"><text x="${cw / 2}" y="34" font-size="34" font-family="DejaVu Sans" font-weight="bold" text-anchor="middle" fill="${fill}" stroke="#000" stroke-width="2">${t}</text></svg>`), left: (i % cols) * cw, top: Math.floor(i / cols) * ch };
  });
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png().toFile(path.join(out, `${name}-hd.png`));
  let fnt = `info face="${name}" size=40\ncommon lineHeight=${ch} base=36 scaleW=${W} scaleH=${H} pages=1\npage id=0 file="${name}-hd.png"\nchars count=${chars.length}\n`;
  chars.forEach((c, i) => { fnt += `char id=${c} x=${(i % cols) * cw} y=${Math.floor(i / cols) * ch} width=${cw} height=${ch} xoffset=0 yoffset=0 xadvance=${cw - 6} page=0 chnl=0\n`; });
  fs.writeFileSync(path.join(out, `${name}-hd.fnt`), fnt);
}
await font("bigFont", "#ffffff");
await font("goldFont", "#ffcc33");
await font("chatFont", "#ffffff");
console.log(`fake resources in ${out}: ${textures.size} object textures`);
