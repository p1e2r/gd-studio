import path from "node:path";

const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  // Folder holding your Geometry Dash "Resources" folder (mount it read-only in Docker).
  resourcesDir: path.resolve(env.RESOURCES_DIR || "/gd-resources"),
  // Writable data folder: sessions, saved levels, sprite cache, uploaded Resources.
  dataDir: path.resolve(env.DATA_DIR || "./data-local"),
  // Geometry Dash server. Point at a GDPS by changing this.
  gdServer: (env.GD_SERVER || "https://www.boomlings.com/database").replace(/\/$/, ""),
  // Minimum gap between requests to the GD server (ms). Keep this polite, RobTop IP-bans spammers.
  gdMinInterval: Number(env.GD_MIN_INTERVAL_MS || 400),
  // Cache lifetime for read-only GD responses (seconds).
  cacheSeconds: Number(env.CACHE_SECONDS || 300),
  // Uploading stats (needed to change account icons through the API) is risky; off unless enabled.
  enableScoreUpload: /^(1|true|yes)$/i.test(env.ENABLE_SCORE_UPLOAD || ""),
  // Cookies get the Secure flag when served over https (Cloudflare tunnel sets X-Forwarded-Proto).
  trustProxy: env.TRUST_PROXY !== "false",
  // Needed to rescan/upload GD Resources from the web UI. Without it, setup only works from your LAN.
  adminPassword: env.ADMIN_PASSWORD || "",
  // Per-visitor limit on /api requests per minute (protects your IP from a RobTop ban when public).
  apiPerMinute: Number(env.API_PER_MINUTE || 90),
};
