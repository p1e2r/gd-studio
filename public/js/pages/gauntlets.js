// GD GauntletSelectLayer: islands you scroll through
import { h, api, go } from "../core.js";
import { sprite, text } from "../gd.js";
import { backButton, spinner, errorPanel } from "../ui.js";

let names = null;
export default async function gauntlets(app) {
  const strip = h("div", { class: "gauntlet-strip" }, spinner());
  app.append(backButton("/creator"), h("div", { class: "center", style: { marginTop: "16px" } }, text("The Lost Gauntlets", { font: "goldFont", size: 40 })), strip);
  try {
    names ||= await fetch("/data/gauntlets.json").then((r) => r.json());
    const list = await api("/gauntlets");
    strip.replaceChildren(...list.map((g) => {
      const name = names[g.id] || `Gauntlet ${g.id}`;
      const key = name.toLowerCase().replace(/\s+/g, "");
      const img = sprite(`island_${key}_001.png`, { class: "island" });
      img.addEventListener("error", () => { img.src = `/sprite/island_new${String(((g.id - 1) % 35) + 1).padStart(2, "0")}_001.png`; img.classList.remove("missing"); }, { once: true });
      return h("button", { class: "gauntlet-card", onclick: () => go(`/search?gauntlet=${g.id}`) },
        text(name, { font: "bigFont", size: 26, align: "center" }), text("Gauntlet", { font: "goldFont", size: 18 }), img,
        text(`${g.levels.length} levels`, { font: "bigFont", size: 13 }));
    }));
  } catch (e) { strip.replaceWith(errorPanel(e)); }
}
