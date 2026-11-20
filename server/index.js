import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import * as assets from "./assets.js";
import { api } from "./routes.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
fs.mkdirSync(config.dataDir, { recursive: true });

const app = express();
if (config.trustProxy) app.set("trust proxy", true);
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

app.use("/api", api);

// Individual sprite frames (or loose pngs) from the GD install, e.g. /sprite/GJ_arrow_01_001.png
app.get("/sprite/:name", async (req, res, next) => {
  try {
    const s = await assets.sprite(req.params.name);
    if (!s) return res.status(404).end();
    res.set("Cache-Control", "public, max-age=86400").sendFile(s.file);
  } catch (e) { next(e); }
});

// Whole sheet / font page images
app.get("/res/:key", (req, res) => {
  const file = assets.resolveRes(req.params.key, req.query.q);
  if (!file) return res.status(404).end();
  res.set("Cache-Control", "public, max-age=86400").sendFile(file);
});

app.use("/data", express.static(path.join(root, "data"), { maxAge: "1d" }));
app.use(express.static(path.join(root, "public"), { maxAge: 0, index: "index.html" }));
// SPA fallback
app.get(/^\/(?!api|sprite|res|data).*/, (req, res) => res.sendFile(path.join(root, "public", "index.html")));

const st = assets.load();
app.listen(config.port, () => {
  console.log(`GD Studio on http://localhost:${config.port}`);
  if (!st.ready) {
    console.log("! Geometry Dash Resources not found or incomplete.");
    console.log(`  Looked in: ${st.searched.join(", ")}`);
    if (st.missing.length) console.log(`  Missing: ${st.missing.join(", ")}`);
    console.log("  Open the site and follow the setup screen, or mount your GD Resources folder at RESOURCES_DIR.");
  } else {
    console.log(`  Loaded ${st.frames} sprites from ${st.sheets} sheets in ${st.dir}`);
  }
});
