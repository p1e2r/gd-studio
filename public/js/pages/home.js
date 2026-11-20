// GD MenuLayer: logo, Garage / Play / Creator, bottom row of round buttons
import { h, state, go, api, toast } from "../core.js";
import { sprite, text, iconCanvas } from "../gd.js";
import { spriteBtn } from "../ui.js";
import { refreshStatus } from "../app.js";
import { loadKit } from "./iconkit.js";

export default async function home(app) {
  const me = state.status?.me;
  const kit = loadKit();
  const big = (frame, label, to, height) => {
    const b = spriteBtn(frame, label, () => go(to), { height });
    b.classList.add("menu-big");
    return b;
  };
  const small = (frame, label, to) => {
    const b = spriteBtn(frame, label, () => go(to), { height: 64 });
    return h("div", { class: "menu-small" }, b, text(label, { font: "bigFont", size: 12 }));
  };
  const profile = h("div", { class: "menu-profile" },
    spriteBtn("GJ_profileButton_001.png", "Profile", () => go(me ? `/profile/${encodeURIComponent(me.username)}` : "/login"), { height: 70 }),
    text(me ? me.username : "Log in", { font: "goldFont", size: 18 }),
    me ? h("button", { class: "linkish", onclick: async () => { await api("/logout", { method: "POST" }); await refreshStatus(); toast("Logged out"); go(`/?t=${Date.now()}`); } }, text("Log out", { font: "bigFont", size: 11 })) : null);

  app.classList.add("menu-layer");
  app.append(
    h("div", { class: "menu-logo" }, sprite("GJ_logo_001.png", { class: "logo" }), text("Studio", { font: "goldFont", size: 34 })),
    h("div", { class: "menu-main" },
      big("GJ_garageBtn_001.png", "Icon Kit", "/iconkit", 130),
      big("GJ_playBtn_001.png", "Online Levels", "/search", 190),
      big("GJ_creatorBtn_001.png", "Creator", "/creator", 130)),
    h("div", { class: "menu-icon" }, iconCanvas({ form: "cube", id: kit.icons.cube, col1: kit.col1, col2: kit.col2, col3: kit.col3, glow: kit.glow }, 46)),
    h("div", { class: "menu-bottom" },
      small("GJ_statsBtn_001.png", "Scores", "/leaderboard"),
      small("GJ_achBtn_001.png", "Save Explorer", "/save"),
      small("GJ_moreGamesBtn_001.png", "Tools", "/tools"),
      small("GJ_optionsBtn_001.png", "Setup", "/setup")),
    profile);
  return { destroy: () => app.classList.remove("menu-layer") };
}
