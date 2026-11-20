import { h, api, download } from "../core.js";
import { text, renderText, hexToRgb } from "../gd.js";
import { panel, btn, backButton } from "../ui.js";

const NAMES = { bigFont: "Pusab (bigFont)", goldFont: "Gold (goldFont)", chatFont: "Chat (chatFont)" };

export default async function fontGen(app) {
  const fonts = await api("/fonts").catch(() => ["bigfont", "goldfont", "chatfont"]);
  const fixCase = (f) => ({ bigfont: "bigFont", goldfont: "goldFont", chatfont: "chatFont" }[f] || f.replace(/^gjfont/, "gjFont"));
  const s = { font: "bigFont", text: "Geometry Dash", color: "#ffffff", tint: false, scale: 1, align: "center", spacing: 0, bg: "" };
  const canvas = h("canvas", { class: "preview" });
  const field = (l, el) => h("label", { class: "ed-field" }, h("span", null, l), el);

  async function draw() {
    const r = await renderText(s.font, s.text, { color: s.tint ? hexToRgb(s.color) : null, align: s.align, spacing: s.spacing, colorTags: true });
    const pad = 20;
    canvas.width = Math.round(r.canvas.width * s.scale) + pad * 2;
    canvas.height = Math.round(r.canvas.height * s.scale) + pad * 2;
    const ctx = canvas.getContext("2d");
    if (s.bg) { ctx.fillStyle = s.bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(r.canvas, pad, pad, r.canvas.width * s.scale, r.canvas.height * s.scale);
    canvas.style.maxWidth = "100%";
  }

  app.append(backButton("/"), h("div", { class: "center" }, text("Font Generator", { font: "goldFont", size: 40 })),
    panel("", h("div", { class: "center", style: { overflowX: "auto" } }, canvas)),
    panel("", h("div", { class: "col" },
      field("Text", h("textarea", { class: "gd-input", oninput: (e) => { s.text = e.target.value; draw(); } }, s.text)),
      field("Font", h("select", { class: "gd-input", onchange: (e) => { s.font = e.target.value; draw(); } },
        ...fonts.map(fixCase).map((f) => h("option", { value: f, selected: f === s.font }, NAMES[f] || f)))),
      field("Tint", h("input", { type: "checkbox", onchange: (e) => { s.tint = e.target.checked; draw(); } })),
      field("Color", h("input", { type: "color", value: s.color, oninput: (e) => { s.color = e.target.value; draw(); } })),
      field("Scale", h("input", { type: "range", min: 0.1, max: 2, step: 0.05, value: 1, oninput: (e) => { s.scale = +e.target.value; draw(); } })),
      field("Letter spacing", h("input", { type: "range", min: -10, max: 40, step: 1, value: 0, oninput: (e) => { s.spacing = +e.target.value; draw(); } })),
      field("Align", h("select", { class: "gd-input", onchange: (e) => { s.align = e.target.value; draw(); } }, ...["left", "center", "right"].map((a) => h("option", { value: a, selected: a === s.align }, a)))),
      field("Background", h("select", { class: "gd-input", onchange: (e) => { s.bg = e.target.value; draw(); } }, h("option", { value: "" }, "Transparent"), h("option", { value: "#287dff" }, "GD blue"), h("option", { value: "#000000" }, "Black"))),
      h("div", { class: "row center" }, btn("Download PNG", () => canvas.toBlob((b) => download(`${s.text.slice(0, 24).replace(/[^\w ]/g, "") || "text"}.png`, b)))))));
  draw();
}
