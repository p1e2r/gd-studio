// GD CreatorLayer: grid of the game's own creator-menu buttons
import { h, go } from "../core.js";
import { spriteBtn, backButton } from "../ui.js";

const BUTTONS = [
  ["GJ_createBtn_001.png", "Create", "/editor"],
  ["GJ_savedBtn_001.png", "Saved", "/editor"],
  ["GJ_highscoreBtn_001.png", "Scores", "/leaderboard"],
  ["GJ_dailyBtn_001.png", "Daily", "/level/daily"],
  ["GJ_weeklyBtn_001.png", "Weekly", "/level/weekly"],
  ["GJ_eventBtn_001.png", "Event", "/level/event"],
  ["GJ_gauntletsBtn_001.png", "Gauntlets", "/gauntlets"],
  ["GJ_featuredBtn_001.png", "Featured", "/search?type=6"],
  ["GJ_mapPacksBtn_001.png", "Map Packs", "/mappacks"],
  ["GJ_searchBtn_001.png", "Search", "/search"],
  ["GJ_versusBtn_001.png", "Hall of Fame", "/search?type=16"],
  ["GJ_challengeBtn_001.png", "Trending", "/search?type=3"],
];

export default async function creator(app) {
  app.append(backButton("/"), h("div", { class: "creator-grid" },
    BUTTONS.map(([frame, label, to]) => {
      const b = spriteBtn(frame, label, () => go(to), { height: 118 });
      b.classList.add("creator-btn");
      return b;
    })));
}
