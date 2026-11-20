// Extra tools menu (not in GD) styled like a GD popup
import { h, go } from "../core.js";
import { text } from "../gd.js";
import { panel, btn, backButton } from "../ui.js";

export default async function tools(app) {
  app.append(backButton("/"), panel("",
    h("div", { class: "center" }, text("Tools", { font: "goldFont", size: 40 })),
    h("div", { class: "col", style: { alignItems: "center", gap: "12px", marginTop: "10px" } },
      btn("Icon Kit", () => go("/iconkit")),
      btn("Save Explorer", () => go("/save")),
      btn("Comment Generator", () => go("/comment"), { color: "cyan" }),
      btn("Textbox Generator", () => go("/textbox"), { color: "cyan" }),
      btn("Font Generator", () => go("/font"), { color: "cyan" }),
      btn("My Levels", () => go("/editor"), { color: "pink" }),
      btn("Setup", () => go("/setup"), { color: "grey" }))));
}
