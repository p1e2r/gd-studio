import express from "express";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { config } from "./config.js";
import * as assets from "./assets.js";
import * as store from "./store.js";
import {
  gdPost, GDError, kv, parseLevel, parseLevelList, parseUser, parseComments, parseScores,
  parseMapPacks, parseGauntlets, parseSongs,
} from "./gd.js";
import {
  SECRETS, gjp2, b64encode, commentChk, levelUploadChk, statsChk, randomSeed,
  decodeLevelString, encodeLevelString, decodeSave, encodeSave,
} from "./crypto.js";
import { parsePlist, writeGdPlist } from "./plist.js";

export const api = express.Router();
const ttl = config.cacheSeconds;

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function cookie(req, name) {
  const c = req.headers.cookie || "";
  for (const part of c.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}
const session = (req) => store.getSession(cookie(req, "gds_sid"));

export const clientIp = (req) => req.headers["cf-connecting-ip"] || req.ip || req.socket.remoteAddress || "?";

// Per-visitor rate limit (sliding 60 s window) on top of the global GD request queue.
const hits = new Map();
const LIMITED = /^\/(search|level|profile|comments|leaderboard|mappacks|gauntlets|song|login|comment|post|upload-level|update-icons)(\/|$)/;
api.use((req, res, next) => {
  if (!LIMITED.test(req.path)) return next();
  const ip = clientIp(req);
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 60000) hits.delete(k);
  if (list.length > config.apiPerMinute) {
    res.setHeader("Retry-After", "30");
    return res.status(429).json({ error: "Slow down — too many requests. Try again in a minute.", code: "rate" });
  }
  next();
});

// Owner of editor levels: logged-in account, else an anonymous per-browser id cookie.
function owner(req, res) {
  const s = session(req);
  if (s) return `acc_${s.accountID}`;
  let id = cookie(req, "gds_owner");
  if (!id || !/^[\w-]{16,64}$/.test(id)) {
    id = crypto.randomBytes(16).toString("base64url");
    const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
    res.append("Set-Cookie", `gds_owner=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 730}${secure ? "; Secure" : ""}`);
  }
  return `anon_${id}`;
}

const PRIVATE_IP = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::ffff:(127|10|192\.168)\.|fc|fd)/;
function requireAdmin(req) {
  const given = req.headers["x-admin-password"] || "";
  if (config.adminPassword) {
    const a = Buffer.from(String(given)), b = Buffer.from(config.adminPassword);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return;
    throw new GDError("Admin password required", "admin", 403);
  }
  // No password set: only allow requests that come straight from the LAN (not through Cloudflare).
  if (!req.headers["cf-connecting-ip"] && PRIVATE_IP.test(req.socket.remoteAddress || "")) return;
  throw new GDError("Setup is locked. Set ADMIN_PASSWORD on the server, or open the site from your LAN.", "admin", 403);
}
function requireLogin(req) {
  const s = session(req);
  if (!s) throw new GDError("Log in first", "auth", 401);
  return s;
}
const authParams = (s) => ({ accountID: s.accountID, gjp2: s.gjp2 });

// ---------------- status / setup ----------------
api.get("/status", (req, res) => {
  const s = session(req);
  res.json({
    assets: assets.status(),
    me: s ? { username: s.userName, accountID: s.accountID, playerID: s.playerID } : null,
    gdServer: config.gdServer,
    features: { scoreUpload: config.enableScoreUpload, adminPassword: !!config.adminPassword },
  });
});

api.post("/setup/reload", wrap(async (req, res) => { requireAdmin(req); res.json(assets.load()); }));

api.post("/setup/upload", wrap(async (req, res) => {
  requireAdmin(req);
  const tmp = path.join(os.tmpdir(), `gdres-${Date.now()}.zip`);
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp);
    req.pipe(out);
    out.on("finish", resolve);
    out.on("error", reject);
    req.on("error", reject);
  });
  try {
    const zip = new AdmZip(tmp);
    const dest = assets.uploadedResourcesDir();
    await fsp.rm(dest, { recursive: true, force: true });
    await fsp.mkdir(dest, { recursive: true });
    let n = 0;
    for (const e of zip.getEntries()) {
      if (e.isDirectory) continue;
      const parts = e.entryName.replace(/\\/g, "/").split("/");
      if (parts.includes("__MACOSX") || parts.some((x) => x.startsWith("._"))) continue;
      const i = parts.findIndex((p) => p.toLowerCase() === "resources");
      const rel = (i >= 0 ? parts.slice(i + 1) : parts).join("/");
      if (!rel || rel.includes("..") || !/\.(png|plist|fnt|mp3|ogg)$/i.test(rel)) continue;
      const target = path.join(dest, rel);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, e.getData());
      n++;
    }
    res.json({ extracted: n, ...assets.load() });
  } finally {
    fsp.rm(tmp, { force: true });
  }
}));

// ---------------- assets ----------------
api.get("/atlas", (req, res) => {
  const keys = String(req.query.sheets || "").split(",").filter(Boolean);
  res.set("Cache-Control", "public, max-age=3600").json(assets.atlas(keys));
});

api.get("/atlas/game", (req, res) => {
  const keys = assets.sheetForPrefix("gj_gamesheet").concat(assets.sheetForPrefix("firesheet"), assets.sheetForPrefix("gj_particlesheet"));
  res.set("Cache-Control", "public, max-age=3600").json(assets.atlas(keys));
});

api.get("/fonts", (req, res) => res.json(assets.fontList()));
api.get("/font/:name", (req, res) => {
  const f = assets.font(req.params.name);
  if (!f) return res.status(404).json({ error: "font not found" });
  res.set("Cache-Control", "public, max-age=3600").json(f);
});

api.get("/frames", (req, res) => {
  let re;
  try { re = new RegExp(String(req.query.match || "."), "i"); } catch { return res.status(400).json({ error: "bad regex" }); }
  res.json(assets.framesMatching(re, 3000));
});

api.get("/icons/forms", (req, res) => res.json(assets.iconCounts()));
api.get("/icons/:form/:id", (req, res) => {
  const prefix = assets.ICON_FORMS[req.params.form];
  const id = String(parseInt(req.params.id, 10) || 1).padStart(2, "0");
  if (!prefix) return res.status(404).json({ error: "unknown form" });
  const key = `icons/${prefix}_${id}.plist`;
  const a = assets.atlas([key]);
  if (!Object.keys(a.frames).length) return res.status(404).json({ error: "icon not found" });
  a.anim = ["robot", "spider"].includes(req.params.form) ? assets.animDesc(req.params.form) : null;
  res.set("Cache-Control", "public, max-age=3600").json(a);
});

// ---------------- GD browsing ----------------
const DAILY = { daily: -1, weekly: -2, event: -3 };

api.get("/search", wrap(async (req, res) => {
  const q = req.query;
  const params = { str: q.str ?? "", type: q.type ?? 0, page: q.page ?? 0, total: 0 };
  for (const k of ["diff", "len", "star", "featured", "epic", "legendary", "mythic", "coins", "twoPlayer", "original", "noStar", "uncompleted", "song", "customSong", "demonFilter", "gauntlet", "followed", "completedLevels"]) {
    if (q[k] !== undefined && q[k] !== "") params[k] = q[k];
  }
  if (params.diff === undefined) params.diff = "-";
  if (params.len === undefined) params.len = "-";
  try {
    res.json(parseLevelList(await gdPost("getGJLevels21.php", params, { cache: ttl })));
  } catch (e) {
    if (e.code === -1) return res.json({ levels: [], total: 0, offset: 0, pageSize: 10 });
    throw e;
  }
}));

async function downloadLevel(idParam) {
  const id = DAILY[idParam] ?? parseInt(idParam, 10);
  if (!Number.isFinite(id)) throw new GDError("bad level id", "bad", 400);
  const text = await gdPost("downloadGJLevel22.php", { levelID: id }, { cache: id < 0 ? 60 : ttl });
  const [lvl, , , , creator = "", , , songs = ""] = text.split("#");
  const l = kv(lvl);
  const creators = {};
  if (creator) { const [pid, name, acc] = creator.split(":"); creators[pid] = { name, accountID: Number(acc) }; }
  return parseLevel(l, creators, parseSongs(songs));
}

api.get("/level/:id", wrap(async (req, res) => {
  const level = await downloadLevel(req.params.id);
  // Fill in author + song if the download reply didn't include them.
  if (!level.author) {
    try {
      const list = parseLevelList(await gdPost("getGJLevels21.php", { str: level.id, type: 0 }, { cache: ttl }));
      const hit = list.levels.find((x) => x.id === level.id);
      if (hit) { level.author = hit.author; level.accountID = hit.accountID; if (hit.song?.name) level.song = hit.song; }
    } catch { /* ignore */ }
  }
  const s = session(req);
  level.mine = !!(s && level.playerID === s.playerID);
  const hasData = !!level.levelString;
  delete level.levelString;
  if (!level.copyable && !level.mine) delete level.password;
  res.json({ ...level, hasData });
}));

api.get("/level/:id/data", wrap(async (req, res) => {
  const text = await gdPost("downloadGJLevel22.php", { levelID: DAILY[req.params.id] ?? req.params.id }, { cache: ttl });
  const l = kv(text.split("#")[0]);
  const level = parseLevel(l);
  const s = session(req);
  res.json({
    id: level.id, name: level.name, copyable: level.copyable, mine: !!(s && level.playerID === s.playerID),
    song: level.customSong || null, officialSong: level.officialSong,
    data: decodeLevelString(l[4] || ""),
  });
}));

api.get("/profile/:name", wrap(async (req, res) => {
  let accountID = req.query.account ? req.params.name : null;
  if (!accountID) {
    const found = kv(await gdPost("getGJUsers20.php", { str: req.params.name }, { cache: ttl }).then((t) => t.split("|")[0]));
    accountID = found[16];
    if (!accountID || accountID === "0") {
      return res.json({ ...parseUser(found), unregistered: true });
    }
  }
  res.json(parseUser(kv(await gdPost("getGJUserInfo20.php", { targetAccountID: accountID }, { cache: ttl }))));
}));

api.get("/profile/:accountID/posts", wrap(async (req, res) => {
  try {
    res.json(parseComments(await gdPost("getGJAccountComments20.php", { accountID: req.params.accountID, page: req.query.page || 0 }, { cache: 30 }), { profile: true }));
  } catch (e) {
    if (e.code === -1) return res.json({ comments: [], total: 0 });
    throw e;
  }
}));

api.get("/comments/:levelID", wrap(async (req, res) => {
  try {
    res.json(parseComments(await gdPost("getGJComments21.php", {
      levelID: req.params.levelID, page: req.query.page || 0, mode: req.query.top ? 1 : 0, count: 20,
    }, { cache: 30 })));
  } catch (e) {
    if (e.code === -1 || e.code === -2) return res.json({ comments: [], total: 0 });
    throw e;
  }
}));

api.get("/leaderboard", wrap(async (req, res) => {
  const type = ["top", "creators", "relative", "friends"].includes(req.query.type) ? req.query.type : "top";
  const s = session(req);
  const extra = (type === "relative" || type === "friends") && s ? authParams(s) : {};
  res.json(parseScores(await gdPost("getGJScores20.php", { type, count: Math.min(+req.query.count || 100, 200), ...extra }, { cache: 300 })));
}));

api.get("/mappacks", wrap(async (req, res) => {
  res.json(parseMapPacks(await gdPost("getGJMapPacks21.php", { page: req.query.page || 0 }, { cache: 3600 })));
}));

api.get("/gauntlets", wrap(async (req, res) => {
  res.json(parseGauntlets(await gdPost("getGJGauntlets21.php", { special: 1 }, { cache: 3600 })));
}));

const OFFICIAL = ["StereoMadness", "BackOnTrack", "Polargeist", "DryOut", "BaseAfterBase", "CantLetGo", "Jumper", "TimeMachine", "Cycles", "xStep", "Clutterfunk", "TheoryOfEverything", "Electroman", "Clubstep", "Electrodynamix", "HexagonForce", "BlastProcessing", "TheoryOfEverything2", "GeometricalDominator", "Deadlocked", "Fingerdash", "Dash"];
api.get("/official-song/:n", (req, res) => {
  const name = OFFICIAL[Number(req.params.n)];
  const f = name && (assets.findFile(`${name}.mp3`) || assets.findFile(`${name}.ogg`));
  if (!f) return res.status(404).end();
  res.set("Cache-Control", "public, max-age=86400").sendFile(f.path);
});

api.get("/song/:id", wrap(async (req, res) => {
  const songs = parseSongs(await gdPost("getGJSongInfo.php", { songID: req.params.id }, { cache: 3600 }));
  res.json(Object.values(songs)[0] || null);
}));

// ---------------- account ----------------
api.post("/login", express.json(), wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) throw new GDError("Username and password required", "bad", 400);
  const hash = gjp2(password);
  let text;
  try {
    text = await gdPost("accounts/loginGJAccount.php", { userName: username, gjp2: hash, udid: `S${Math.floor(Math.random() * 1e9)}`, sID: "0" }, { secret: SECRETS.account });
  } catch (e) {
    const msg = { "-1": "Wrong username or password", "-11": "Account not activated", "-12": "Account disabled", "-13": "Account linked to another Steam ID" }[e.code];
    throw new GDError(msg || e.message, e.code, 401);
  }
  const [accountID, playerID] = text.split(",");
  let userName = username;
  try { userName = parseUser(kv(await gdPost("getGJUserInfo20.php", { targetAccountID: accountID }))).username || username; } catch { /* keep */ }
  const sid = store.createSession({ accountID: Number(accountID), playerID: Number(playerID), userName, gjp2: hash });
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.setHeader("Set-Cookie", `gds_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}${secure ? "; Secure" : ""}`);
  res.json({ username: userName, accountID: Number(accountID), playerID: Number(playerID) });
}));

api.post("/logout", (req, res) => {
  store.deleteSession(cookie(req, "gds_sid"));
  res.setHeader("Set-Cookie", "gds_sid=; Path=/; Max-Age=0");
  res.json({ ok: true });
});

api.post("/comment", express.json(), wrap(async (req, res) => {
  const s = requireLogin(req);
  const { levelID, text, percent = 0 } = req.body || {};
  if (!text || !levelID) throw new GDError("Missing comment or level", "bad", 400);
  const commentB64 = b64encode(String(text).slice(0, 100));
  const r = await gdPost("uploadGJComment21.php", {
    ...authParams(s), userName: s.userName, comment: commentB64, levelID, percent,
    chk: commentChk({ userName: s.userName, commentB64, levelID, percent }),
  }, { raw: true });
  if (r.startsWith("temp_")) throw new GDError(`Temporarily banned from commenting (${r.split("_")[2] || "no reason"})`, "ban", 403);
  if (r.startsWith("-")) throw new GDError(`Comment rejected (${r})`, r, 400);
  res.json({ id: Number(r) });
}));

api.post("/post", express.json(), wrap(async (req, res) => {
  const s = requireLogin(req);
  const commentB64 = b64encode(String(req.body?.text || "").slice(0, 190));
  const r = await gdPost("uploadGJAccComment20.php", { ...authParams(s), userName: s.userName, comment: commentB64, cType: 1 }, { raw: true });
  if (r.startsWith("-")) throw new GDError(`Post rejected (${r})`, r, 400);
  res.json({ id: Number(r) });
}));

api.post("/upload-level", express.json({ limit: "50mb" }), wrap(async (req, res) => {
  const s = requireLogin(req);
  const b = req.body || {};
  const raw = String(b.data || "");
  if (!raw.includes(";")) throw new GDError("Level is empty", "bad", 400);
  const levelString = encodeLevelString(raw);
  const objects = raw.split(";").length - 2;
  let password = "0";
  if (b.copy === "free") password = "1";
  else if (/^\d{1,6}$/.test(String(b.password || ""))) password = "1" + String(Number(b.password)).padStart(6, "0");
  const params = {
    ...authParams(s), userName: s.userName,
    levelID: b.levelID || 0, levelName: String(b.name || "Unnamed").slice(0, 20),
    levelDesc: b64encode(String(b.description || "").slice(0, 180)),
    levelVersion: b.version || 1, levelLength: b.length ?? 0,
    audioTrack: b.officialSong ?? 0, auto: 0,
    password: password === "0" ? 0 : password,
    original: 0, twoPlayer: b.twoPlayer ? 1 : 0, songID: b.songID || 0,
    objects: Math.max(objects, 0), coins: b.coins || 0, requestedStars: b.requestedStars || 0,
    unlisted: b.unlisted ? (b.unlisted === "friends" ? 2 : 1) : 0, ldm: 0,
    wt: b.editorTime || 0, wt2: 0, ts: 0, songIDs: "", sfxIDs: "",
    levelString, seed: randomSeed(10), seed2: levelUploadChk(levelString),
  };
  const r = await gdPost("uploadGJLevel21.php", params, { secret: SECRETS.common, raw: true });
  if (!/^\d+$/.test(r)) throw new GDError(`Upload rejected by server (${r || "empty reply"})`, r, 400);
  res.json({ levelID: Number(r) });
}));

api.post("/update-icons", express.json(), wrap(async (req, res) => {
  if (!config.enableScoreUpload) throw new GDError("Account icon upload is disabled. Set ENABLE_SCORE_UPLOAD=true to enable it (experimental).", "disabled", 403);
  const s = requireLogin(req);
  const me = parseUser(kv(await gdPost("getGJUserInfo20.php", { targetAccountID: s.accountID, ...authParams(s) })));
  const b = req.body || {};
  const icons = { ...me.icons, ...(b.icons || {}) };
  const p = {
    ...authParams(s), userName: s.userName,
    stars: me.stars, moons: me.moons, demons: me.demons, diamonds: me.diamonds, coins: me.coins, userCoins: me.userCoins,
    icon: b.icon ?? icons.cube, iconType: b.iconType ?? 0,
    accIcon: icons.cube, accShip: icons.ship, accBall: icons.ball, accBird: icons.ufo, accDart: icons.wave,
    accRobot: icons.robot, accSpider: icons.spider, accSwing: icons.swing, accJetpack: icons.jetpack,
    accExplosion: icons.explosion, accGlow: b.glow ? 1 : 0,
    color1: b.col1 ?? me.col1, color2: b.col2 ?? me.col2, color3: b.col3 ?? me.col3, special: 0,
    dinfo: "", dinfow: 0, dinfog: 0, sinfo: "", sinfod: 0, sinfog: 0,
    seed: randomSeed(10),
  };
  p.seed2 = statsChk(p);
  const r = await gdPost("updateGJUserScore22.php", p, { raw: true });
  if (!/^\d+$/.test(r)) throw new GDError(`Server rejected the update (${r || "empty"}). Change icons in game or with the Save Explorer instead.`, r, 400);
  res.json({ ok: true });
}));

// ---------------- editor levels ----------------
api.get("/levels", (req, res) => res.json(store.listLevels(owner(req, res))));
api.get("/levels/:id", (req, res) => {
  const l = store.getLevel(owner(req, res), req.params.id);
  if (!l) return res.status(404).json({ error: "not found" });
  res.json(l);
});
api.post("/levels", express.json({ limit: "50mb" }), (req, res) => res.json(store.saveLevel(owner(req, res), { ...req.body, id: undefined })));
api.put("/levels/:id", express.json({ limit: "50mb" }), (req, res) => res.json(store.saveLevel(owner(req, res), { ...req.body, id: req.params.id })));
api.delete("/levels/:id", (req, res) => res.json({ ok: store.deleteLevel(owner(req, res), req.params.id) }));

// ---------------- level string helpers ----------------
api.post("/levelstring/decode", express.text({ limit: "100mb", type: "*/*" }), (req, res) => {
  res.type("text/plain").send(decodeLevelString(String(req.body || "").trim()));
});
api.post("/levelstring/encode", express.text({ limit: "100mb", type: "*/*" }), (req, res) => {
  res.type("text/plain").send(encodeLevelString(String(req.body || "")));
});

// ---------------- save files ----------------
api.post("/save/decode", express.raw({ limit: "300mb", type: "*/*" }), (req, res) => {
  const { xml, format } = decodeSave(req.body);
  const data = parsePlist(xml);
  res.json({ format, data });
});
api.post("/save/encode", express.json({ limit: "300mb" }), (req, res) => {
  const { data, format = "windows" } = req.body || {};
  res.type("application/octet-stream").send(encodeSave(writeGdPlist(data), format));
});

// GD .gmd export/import (single level plist)
api.post("/gmd/encode", express.json({ limit: "100mb" }), (req, res) => {
  const b = req.body || {};
  const lvl = {
    kCEK: 4, k2: b.name || "Unnamed", k3: b64encode(b.description || ""), k4: encodeLevelString(b.data || ""),
    k5: b.author || "", k13: true, k21: 2, k16: 1, k80: b.editorTime || 0, k50: 45, k45: b.songID || 0, k8: b.officialSong || 0,
  };
  const xml = writeGdPlist(lvl).replace(' gjver="2.0"', "");
  res.type("application/xml").send(xml);
});
api.post("/gmd/decode", express.text({ limit: "100mb", type: "*/*" }), (req, res) => {
  const d = parsePlist(String(req.body || ""));
  let desc = "";
  try { desc = Buffer.from(String(d.k3 || ""), "base64").toString("utf8"); } catch { /* ignore */ }
  res.json({ name: d.k2, description: desc, data: decodeLevelString(d.k4 || ""), songID: d.k45 || 0, officialSong: d.k8 || 0 });
});

// ---------------- errors ----------------
api.use((err, req, res, _next) => {
  const status = err.status || (err.type === "entity.too.large" ? 413 : 500);
  if (status >= 500 && !(err instanceof GDError)) console.error(err);
  res.status(status).json({ error: err.message || "error", code: err.code ?? null });
});
