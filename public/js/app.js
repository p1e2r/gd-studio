import { h, api, parseHash, state } from "./core.js";
import { errorPanel } from "./ui.js";

const routes = {
  "": () => import("./pages/home.js"),
  search: () => import("./pages/search.js"),
  creator: () => import("./pages/creator.js"),
  tools: () => import("./pages/tools.js"),
  level: () => import("./pages/level.js"),
  profile: () => import("./pages/profile.js"),
  leaderboard: () => import("./pages/leaderboard.js"),
  gauntlets: () => import("./pages/gauntlets.js"),
  mappacks: () => import("./pages/mappacks.js"),
  login: () => import("./pages/login.js"),
  iconkit: () => import("./pages/iconkit.js"),
  editor: () => import("./pages/editor.js"),
  save: () => import("./pages/save.js"),
  comment: () => import("./pages/comment.js"),
  textbox: () => import("./pages/textbox.js"),
  font: () => import("./pages/font.js"),
  setup: () => import("./pages/setup.js"),
};

export async function refreshStatus() {
  try { state.status = await api("/status"); } catch { state.status = { assets: { ready: false, missing: [] } }; }
  const banner = document.getElementById("banner");
  const ready = state.status.assets.ready;
  document.body.classList.toggle("no-gd-assets", !ready);
  banner.replaceChildren(ready ? "" : h("span", null,
    "Geometry Dash assets are missing, so things won't look like the game yet. ",
    h("a", { href: "#/setup" }, "Set up your GD Resources folder →")));
  return state.status;
}

let current = null;
async function render() {
  const { parts, query } = parseHash();
  const key = parts[0] || "";
  const app = document.getElementById("app");
  if (current?.destroy) { try { current.destroy(); } catch { /* ignore */ } }
  current = null;
  document.body.classList.remove("fullscreen");
  const loader = routes[key];
  if (!loader) { app.replaceChildren(errorPanel(new Error("Page not found"))); return; }
  try {
    const mod = await loader();
    app.replaceChildren();
    window.scrollTo(0, 0);
    current = (await mod.default(app, parts.slice(1), query)) || null;
  } catch (e) {
    console.error(e);
    app.replaceChildren(errorPanel(e));
  }
}

window.addEventListener("hashchange", render);
(async () => {
  const st = await refreshStatus();
  // Remind once per browser session to finish setup when assets are missing.
  if (!st.assets.ready && !sessionStorage.getItem("gds:setup-reminded") && !location.hash.startsWith("#/setup")) {
    sessionStorage.setItem("gds:setup-reminded", "1");
    location.hash = "#/setup";
  }
  render();
})();
