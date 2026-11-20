# GD Studio

A self-hosted, Geometry Dash–styled website: level browser, profiles, leaderboards, icon kit, save-file explorer, comment / textbox / font generators and a GD-style level editor. It's a GDBrowser-like site that draws everything with the sprites and fonts from **your own** Geometry Dash install.

> Geometry Dash and all of its assets, sprites, music and data belong to [RobTop Games](https://www.robtopgames.com). GD Studio is an unofficial, non-commercial fan project and is not affiliated with or endorsed by RobTop Games. No GD assets are included in this repository.

## Features

- **Browser**: search with filters (difficulty, length, featured/epic/legendary/mythic, coins…), featured, trending, recent, most liked/downloaded, Hall of Fame, daily/weekly, gauntlets, map packs.
- **Level pages**: difficulty face, stats, song, copy status, and comments, which you can post when logged in.
- **Profiles**: stats, every icon rendered with the player's colors, profile posts and levels.
- **Leaderboards**: top 100, creators, and global/friends when logged in.
- **Icon Kit**: every form and color from your install, glow, PNG download, load any player's icons. You can apply icons to your save file, or (experimentally) to your account.
- **Save Explorer**: decode `CCGameManager.dat` / `CCLocalLevels.dat` from Windows or macOS. Shows stats and the full data tree. Edit icons and download the re-encoded save, or open and export your local levels.
- **Generators**: GD comments, GD textboxes (with color tags and portraits), and text in any GD bitmap font.
- **Level editor** (no playtest), with a menu laid out like [GD Place](https://github.com/PlaceGD/gd-place-2024)'s editor:
  - Build / Edit / Delete side rail, tab strip and a big Place / Delete button.
  - Build by tapping to position a preview, then Place (or Enter / double-click). Swipe paints.
  - Edit tabs: Transform (move pads, flip, rotate, scale, and on-canvas Rotate / Scale / Warp handles), Layers (below / above player, Z order), Colors (channel swatches, HSV), Groups and Special (trigger and start position settings).
  - Copy/paste/duplicate, undo/redo and box select.
  - Colors, HSV, groups, Z layer/order, and trigger + start position settings.
  - Level settings, `.gmd` import/export, level strings, import from your save, and upload to the GD servers.
  - Online levels open read-only unless the creator allows copying (or the level is yours).

## Run it (Docker)

1. Copy your Geometry Dash **Resources** folder to the server, e.g. next to `docker-compose.yml` as `gd-resources/`:
   - Windows (Steam): `C:\Program Files (x86)\Steam\steamapps\common\Geometry Dash\Resources`
   - macOS (Steam): `~/Library/Application Support/Steam/steamapps/common/Geometry Dash/Geometry Dash.app/Contents/Resources`
   - Only `.png`, `.plist`, `.fnt` (and `.mp3` for official songs) are used.
2. `docker compose up -d` and open `http://<server>:3000`.
3. If the Resources folder is missing or incomplete, the site sends you to **Setup** and shows a reminder banner until it's fixed. You can also upload a zip of the folder from the Setup page.

Point a Cloudflare tunnel hostname at the container (the compose file deliberately has no `cloudflared`).

## Making it public

It works without Cloudflare Access. Before you share the link:

- Set `ADMIN_PASSWORD`. Without it, Setup actions (rescan/upload Resources) only work from your LAN.
- Visitors' editor levels are private to them: by account when logged in, otherwise by a browser cookie.
- `API_PER_MINUTE` limits each visitor. All GD traffic also goes through one queue (`GD_MIN_INTERVAL_MS`) and a response cache (`CACHE_SECONDS`), so your home IP stays polite towards boomlings.com.
- `data/sessions.json` holds each logged-in user's account ID and gjp2 (a password-equivalent hash; passwords are never stored). Keep the data volume private.
- There's no playable game in the browser, and the site is non-commercial. Keep it that way.

## Configuration

| Variable | Default | |
|---|---|---|
| `PORT` | `3000` | |
| `RESOURCES_DIR` | `/gd-resources` | your GD Resources folder (read-only is fine) |
| `DATA_DIR` | `/data` (Docker) | sessions, levels, sprite cache, uploaded Resources |
| `GD_SERVER` | `https://www.boomlings.com/database` | change for a GDPS |
| `GD_MIN_INTERVAL_MS` | `400` | min gap between GD requests |
| `CACHE_SECONDS` | `300` | cache for read-only GD replies |
| `API_PER_MINUTE` | `90` | per-visitor limit on GD-facing endpoints |
| `ADMIN_PASSWORD` | empty | unlocks Setup through the public URL |
| `ENABLE_SCORE_UPLOAD` | `false` | experimental "Apply icons to account" (re-uploads your stats; can get you flagged) |

## Development

```sh
npm install
RESOURCES_DIR=/path/to/Resources DATA_DIR=./data-local npm run dev
npm test   # uses synthetic placeholder assets + a mock GD server
```

## Notes and limits

- The object database covers objects up to ID 1911 (GD 2.1). Newer 2.2 objects show as numbered placeholders, but they are kept intact when you save.
- Robot and spider icons use an approximate pose.
- Some UI sprite names are best guesses. If a sprite isn't found in your install, a styled fallback is shown instead.

## License

MIT for the code. See `THIRD_PARTY_NOTICES.md` for the bundled data files.
