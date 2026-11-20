import { h, api, go } from "../core.js";
import { sprite, text } from "../gd.js";
import { backButton, spinner, errorPanel } from "../ui.js";

let names = null;
export default async function gauntlets(app) {
  app.append(backButton("/"), h("div", { class: "center" }, text("The Lost Gauntlets", { font: "goldFont", size: 44 })));
  const grid = h("div", { class: "menu-grid" }, spinner());
  app.append(grid);
  try {
    names ||= await fetch("/data/gauntlets.json").then((r) => r.json());
    const list = await api("/gauntlets");
    grid.replaceChildren(...list.map((g) => {
      const name = names[g.id] || `Gauntlet ${g.id}`;
      return h("a", { class: "menu-tile", href: `#/search?type=0&gauntlet=${g.id}`, onclick: () => go(`/search?gauntlet=${g.id}`) },
        sprite(`island_${name.toLowerCase().replace(/\s+/g, "")}_001.png`),
        text(name, { font: "bigFont", size: 20, align: "center" }),
        text("Gauntlet", { font: "goldFont", size: 16 }));
    }));
  } catch (e) { grid.replaceWith(errorPanel(e)); }
}
