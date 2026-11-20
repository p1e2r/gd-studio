import { h, download, api, toast } from "../core.js";
import { text, drawIcon, FORMS, ICON_TYPE_FORM } from "../gd.js";
import { panel, btn, backButton } from "../ui.js";
import { drawText, drawFrame } from "../canvas-kit.js";
import { loadKit } from "./iconkit.js";

const STYLES = { brown: ["#a1582c", "#c2723e"], blue: ["#1f2e75", "#2b3d8f"], dark: ["#2b1508", "#3b2010"] };

export default async function commentGen(app) {
  const kit = loadKit();
  const s = { username: "RobTop", text: "Hello there! This is a comment.", likes: 1234, percent: 0, age: "5 hours", mod: "none", style: "brown", alt: false, icon: { ...kit, form: "cube" }, width: 900, profile: false };
  const canvas = h("canvas", { class: "preview" });
  const inp = (key, attrs = {}) => h("input", { class: "gd-input", value: s[key], ...attrs, oninput: (e) => { s[key] = attrs.type === "number" ? +e.target.value : e.target.value; draw(); } });
  const sel = (key, opts) => h("select", { class: "gd-input", onchange: (e) => { s[key] = e.target.value; draw(); } }, ...opts.map(([v, l]) => h("option", { value: v, selected: s[key] === v }, l)));
  const field = (l, el) => h("label", { class: "ed-field" }, h("span", null, l), el);

  async function draw() {
    const W = s.width, pad = 22;
    const ctx = canvas.getContext("2d");
    // measure text height
    const tmp = document.createElement("canvas").getContext("2d");
    const { h: th } = await drawText(tmp, "chatFont", s.text, 0, 0, { size: 30, wrap: W - (s.profile ? 60 : 170) });
    const H = Math.max(s.profile ? 110 : 140, th + (s.profile ? 70 : 90));
    canvas.width = W; canvas.height = H;
    canvas.style.width = `${Math.min(W, 900) / 1.5}px`;
    const [c1, c2] = STYLES[s.style];
    ctx.fillStyle = s.alt ? c2 : c1;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(0, H - 3, W, 3);
    let x = pad;
    if (!s.profile) {
      ctx.save(); ctx.translate(60, 52);
      await drawIcon(ctx, { form: s.icon.form, id: s.icon.icons[s.icon.form] || 1, col1: s.icon.col1, col2: s.icon.col2, col3: s.icon.col3, glow: s.icon.glow, unit: 2.4 });
      ctx.restore();
      x = 112;
      const { w } = await drawText(ctx, "goldFont", s.username, x, 14, { size: 40 });
      let bx = x + w + 10;
      if (s.mod !== "none") { if (await drawFrame(ctx, s.mod === "elder" ? "modBadge_02_001.png" : "modBadge_01_001.png", bx + 18, 34, 34)) bx += 44; }
      if (s.percent) await drawText(ctx, "chatFont", `${s.percent}%`, bx + 6, 20, { size: 30, color: "#ffffff" });
    }
    const textColor = s.mod === "elder" ? [75, 255, 75] : s.mod === "mod" ? [255, 230, 100] : null;
    await drawText(ctx, "chatFont", s.text, x, s.profile ? 18 : 64, { size: 30, wrap: W - x - 60, color: textColor });
    // likes + age
    const likeY = H - 30;
    await drawFrame(ctx, s.likes < 0 ? "GJ_dislikesIcon_001.png" : "GJ_likesIcon_001.png", W - 190, likeY, 32);
    await drawText(ctx, "bigFont", String(s.likes), W - 166, likeY, { size: 30, valign: "middle" });
    await drawText(ctx, "chatFont", s.age ? `${s.age} ago` : "", W - 20, 14, { size: 26, align: "right", color: [0, 0, 0] });
  }

  const lookup = h("form", { class: "row", onsubmit: async (e) => {
    e.preventDefault();
    try {
      const u = await api(`/profile/${encodeURIComponent(e.target.u.value.trim())}`);
      s.username = u.username;
      s.icon = { form: ICON_TYPE_FORM[u.iconType] || "cube", icons: u.icons, col1: u.col1, col2: u.col2, col3: u.col3, glow: u.glow };
      s.mod = u.mod || "none";
      draw();
    } catch (err) { toast(err.message, "error"); }
  } }, h("input", { class: "gd-input grow", name: "u", placeholder: "Use a real player's name & icon" }), btn("Load", null, { small: true }));

  app.append(backButton("/"), h("div", { class: "center" }, text("Comment Generator", { font: "goldFont", size: 40 })),
    panel("", h("div", { class: "center" }, canvas)),
    panel("", h("div", { class: "col" }, lookup,
      field("Username", inp("username")),
      field("Comment", h("textarea", { class: "gd-input", oninput: (e) => { s.text = e.target.value; draw(); } }, s.text)),
      field("Likes", inp("likes", { type: "number" })), field("Percent", inp("percent", { type: "number", min: 0, max: 100 })),
      field("Age", inp("age")),
      field("Badge", sel("mod", [["none", "None"], ["mod", "Moderator"], ["elder", "Elder Moderator"]])),
      field("Style", sel("style", [["brown", "Level comment"], ["blue", "Blue"], ["dark", "Dark"]])),
      field("Alternate row", h("input", { type: "checkbox", onchange: (e) => { s.alt = e.target.checked; draw(); } })),
      field("Profile post (no icon/name)", h("input", { type: "checkbox", onchange: (e) => { s.profile = e.target.checked; draw(); } })),
      field("Icon form", h("select", { class: "gd-input", onchange: (e) => { s.icon.form = e.target.value; draw(); } }, ...FORMS.map((f) => h("option", { value: f }, f)))),
      h("div", { class: "row center" }, btn("Download PNG", () => canvas.toBlob((b) => download("gd-comment.png", b))),
        h("span", { class: "small muted" }, "Generated images are for fun/memes — don't pass them off as real comments.")))));
  draw();
}
