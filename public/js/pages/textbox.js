import { h, api, download } from "../core.js";
import { text } from "../gd.js";
import { panel, btn, backButton } from "../ui.js";
import { drawText, nineSlice, sliceImage, drawFrame } from "../canvas-kit.js";

export default async function textboxGen(app) {
  const s = { title: "Hey!", body: "Welcome to <cg>GD Studio</c>. You can use <cr>color</c> <cy>tags</c> like the game.", box: "GJ_square01.png", button: "OK", portrait: "", width: 900, height: 0 };
  const portraits = await api("/frames?match=^dialogIcon_").catch(() => []);
  const canvas = h("canvas", { class: "preview" });
  const field = (l, el) => h("label", { class: "ed-field" }, h("span", null, l), el);

  async function draw() {
    const W = s.width;
    const portraitW = s.portrait ? 180 : 0;
    const probe = document.createElement("canvas").getContext("2d");
    const { h: bodyH } = await drawText(probe, "chatFont", s.body, 0, 0, { size: 34, wrap: W - 110 - portraitW, align: "center" });
    const H = s.height || Math.max(300, bodyH + (s.title ? 110 : 60) + (s.button ? 110 : 40));
    canvas.width = W; canvas.height = H;
    canvas.style.width = `${W / 1.6}px`;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    nineSlice(ctx, await sliceImage(s.box), 0, 0, W, H, 60);
    let y = 34;
    if (s.title) { await drawText(ctx, "goldFont", s.title, W / 2, y, { size: 56, align: "center" }); y += 76; }
    if (s.portrait) await drawFrame(ctx, s.portrait, 40 + portraitW / 2, H / 2, 160);
    await drawText(ctx, "chatFont", s.body, portraitW + (W - portraitW) / 2, y, { size: 34, wrap: W - 110 - portraitW, align: "center" });
    if (s.button) {
      const bw = Math.max(130, s.button.length * 30 + 60), bh = 72;
      const bx = (W - bw) / 2, by = H - bh - 26;
      nineSlice(ctx, await sliceImage("GJ_button_01.png"), bx, by, bw, bh, 26);
      await drawText(ctx, "bigFont", s.button, W / 2, by + bh / 2, { size: 38, align: "center", valign: "middle" });
    }
  }

  app.append(backButton("/"), h("div", { class: "center" }, text("Textbox Generator", { font: "goldFont", size: 40 })),
    panel("", h("div", { class: "center" }, canvas)),
    panel("", h("div", { class: "col" },
      field("Title", h("input", { class: "gd-input", value: s.title, oninput: (e) => { s.title = e.target.value; draw(); } })),
      field("Text", h("textarea", { class: "gd-input", oninput: (e) => { s.body = e.target.value; draw(); } }, s.body)),
      h("div", { class: "small muted" }, "Color tags: <cr> red, <cg> green, <cl> light blue, <cj> cyan, <cy> yellow, <co> orange, <cp> pink, <cb> blue … close with </c>"),
      field("Button", h("input", { class: "gd-input", value: s.button, placeholder: "(none)", oninput: (e) => { s.button = e.target.value; draw(); } })),
      field("Box", h("select", { class: "gd-input", onchange: (e) => { s.box = e.target.value; draw(); } }, ...["GJ_square01.png", "GJ_square02.png", "GJ_square03.png", "GJ_square04.png", "GJ_square05.png", "GJ_square06.png", "square01_001.png", "square02_001.png"].map((n) => h("option", { value: n }, n.replace(".png", ""))))),
      field("Portrait", h("select", { class: "gd-input", onchange: (e) => { s.portrait = e.target.value; draw(); } }, h("option", { value: "" }, "None"), ...portraits.map((p) => h("option", { value: p }, p.replace(".png", ""))))),
      field("Width", h("input", { class: "gd-input", type: "number", value: s.width, min: 300, max: 2000, onchange: (e) => { s.width = +e.target.value || 900; draw(); } })),
      field("Height (0 = auto)", h("input", { class: "gd-input", type: "number", value: 0, min: 0, max: 2000, onchange: (e) => { s.height = +e.target.value || 0; draw(); } })),
      h("div", { class: "row center" }, btn("Download PNG", () => canvas.toBlob((b) => download("gd-textbox.png", b)))))));
  draw();
}
