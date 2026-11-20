// Talks to the Geometry Dash servers (boomlings.com or a GDPS) and parses replies.
import http from "node:http";
import https from "node:https";
import { config } from "./config.js";
import { SECRETS, b64decode, xorDecrypt, XOR_KEYS } from "./crypto.js";

export class GDError extends Error {
  constructor(message, code, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ---------- transport: serial queue + min interval + cache ----------
let last = 0;
let chain = Promise.resolve();
const cache = new Map();

function rawPost(endpoint, body) {
  const url = new URL(`${config.gdServer}/${endpoint}`);
  const lib = url.protocol === "http:" ? http : https;
  return new Promise((resolve, reject) => {
    const req = lib.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent": "",
        Accept: "*/*",
      },
      timeout: 15000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(new Error("GD server timed out")));
    req.on("error", reject);
    req.end(body);
  });
}

export async function gdPost(endpoint, params = {}, { secret = SECRETS.common, cache: ttl = 0, raw = false } = {}) {
  const data = { gameVersion: "22", binaryVersion: "45", gdw: "0", ...params, secret };
  const body = new URLSearchParams(data).toString();
  const key = endpoint + "?" + body;
  if (ttl) {
    const hit = cache.get(key);
    if (hit && hit.until > Date.now()) return hit.value;
  }
  const run = async () => {
    const wait = last + config.gdMinInterval - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return rawPost(endpoint, body);
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  let res;
  try {
    res = await p;
  } catch (e) {
    throw new GDError(`Can't reach the GD server: ${e.message}`, "network");
  }
  const text = res.text.trim();
  if (/error code: 1005|error code: 1020|Access denied/i.test(text) || res.status === 403) {
    throw new GDError("The GD server blocked this server's IP (Cloudflare 1005/1020). This happens to VPS/datacenter IPs; a home connection usually works.", "blocked", 503);
  }
  if (res.status >= 500) throw new GDError(`GD server error ${res.status}`, "server");
  if (!raw && /^-\d+$/.test(text)) throw new GDError(`GD server returned ${text}`, Number(text), text === "-1" ? 404 : 400);
  if (!raw && text === "") throw new GDError("Empty reply from GD server", "empty", 404);
  if (ttl) {
    cache.set(key, { value: text, until: Date.now() + ttl * 1000 });
    if (cache.size > 2000) cache.delete(cache.keys().next().value);
  }
  return text;
}

// ---------- parsing helpers ----------
export function kv(str, sep = ":") {
  const p = str.split(sep);
  const o = {};
  for (let i = 0; i + 1 < p.length; i += 2) o[p[i]] = p[i + 1];
  return o;
}

const num = (v, d = 0) => (v === undefined || v === "" ? d : Number(v));
const b64text = (s) => {
  if (!s) return "";
  try { return b64decode(s).toString("utf8"); } catch { return s; }
};

export const LENGTHS = ["Tiny", "Short", "Medium", "Long", "XL", "Plat."];
const DEMONS = { 3: "Easy", 4: "Medium", 0: "Hard", 5: "Insane", 6: "Extreme" };
const DIFFS = ["N/A", "Easy", "Normal", "Hard", "Harder", "Insane"];

export function difficultyOf(l) {
  const n = num(l[9]);
  if (l[25] === "1") return { name: "Auto", face: "auto" };
  if (l[17] === "1") {
    const d = DEMONS[num(l[43])] ?? "Hard";
    return { name: `${d} Demon`, face: { Easy: "07", Medium: "08", Hard: "06", Insane: "09", Extreme: "10" }[d] };
  }
  const i = Math.round(n / 10);
  return { name: DIFFS[i] ?? "N/A", face: String(i).padStart(2, "0") };
}

export function parseSongs(str) {
  const out = {};
  if (!str) return out;
  for (const s of str.split("~:~")) {
    const o = kv(s, "~|~");
    if (!o[1]) continue;
    out[o[1]] = {
      id: num(o[1]), name: o[2], artistID: num(o[3]), artist: o[4], size: o[5] ? `${o[5]} MB` : null,
      url: o[10] ? decodeURIComponent(o[10]) : null,
    };
  }
  return out;
}

export function parseLevel(l, creators = {}, songs = {}) {
  const diff = difficultyOf(l);
  const songID = num(l[35]);
  let password = l[27];
  if (password && password !== "0" && password !== "1") {
    try { password = xorDecrypt(password, XOR_KEYS.levelPassword); } catch { /* keep */ }
    password = password.length > 1 ? password.slice(1) : password; // leading "1" marker
  }
  const featureScore = num(l[19]);
  return {
    id: num(l[1]),
    name: l[2],
    description: b64text(l[3]),
    version: num(l[5]),
    playerID: num(l[6]),
    author: creators[l[6]]?.name ?? null,
    accountID: creators[l[6]]?.accountID ?? null,
    difficulty: diff.name,
    face: diff.face,
    stars: num(l[18]),
    downloads: num(l[10]),
    likes: num(l[14]),
    length: LENGTHS[num(l[15])] ?? "?",
    platformer: l[15] === "5",
    demon: l[17] === "1",
    featured: featureScore > 0,
    epic: num(l[42]), // 1 epic, 2 legendary, 3 mythic
    gameVersion: num(l[13]),
    coins: num(l[37]),
    verifiedCoins: l[38] === "1",
    starsRequested: num(l[39]),
    twoPlayer: l[31] === "1",
    objects: num(l[45]),
    copiedID: num(l[30]),
    ldm: l[40] === "1",
    officialSong: num(l[12]),
    customSong: songID || null,
    song: songID ? songs[songID] ?? { id: songID } : { official: num(l[12]) },
    copyable: password === "1" || (password && password !== "0"),
    password: password && password !== "0" && password !== "1" ? password : null,
    uploaded: l[28] || null,
    updated: l[29] || null,
    dailyNumber: num(l[41]) || null,
    levelString: l[4] || null,
  };
}

export function parseLevelList(text) {
  const [levels = "", creatorStr = "", songStr = "", page = ""] = text.split("#");
  const creators = {};
  for (const c of creatorStr.split("|")) {
    const [pid, name, acc] = c.split(":");
    if (pid) creators[pid] = { name, accountID: num(acc) };
  }
  const songs = parseSongs(songStr);
  const [total, offset, size] = page.split(":").map(Number);
  return {
    levels: levels ? levels.split("|").map((s) => parseLevel(kv(s), creators, songs)) : [],
    total: total || 0, offset: offset || 0, pageSize: size || 10,
  };
}

export function parseUser(u) {
  return {
    username: u[1],
    playerID: num(u[2]),
    accountID: num(u[16]),
    stars: num(u[3]),
    moons: num(u[52]),
    demons: num(u[4]),
    diamonds: num(u[46]),
    coins: num(u[13]),
    userCoins: num(u[17]),
    creatorPoints: num(u[8]),
    rank: num(u[30]) || num(u[6]) || null,
    col1: num(u[10]), col2: num(u[11]), col3: num(u[51], num(u[10])),
    glow: u[28] === "1" || u[15] === "2",
    iconType: num(u[14]),
    icon: num(u[9]),
    icons: {
      cube: num(u[21], 1), ship: num(u[22], 1), ball: num(u[23], 1), ufo: num(u[24], 1),
      wave: num(u[25], 1), robot: num(u[26], 1), spider: num(u[43], 1), swing: num(u[53], 1),
      jetpack: num(u[54], 1), explosion: num(u[48], 1),
    },
    mod: { 1: "mod", 2: "elder" }[u[49]] ?? null,
    youtube: u[20] || null, twitter: u[44] || null, twitch: u[45] || null,
    demonBreakdown: u[55] || null,
    messages: ["all", "friends", "none"][num(u[18])] ?? "all",
    commentHistory: ["all", "friends", "none"][num(u[50])] ?? "all",
  };
}

export function parseComments(text, { profile = false } = {}) {
  const [list = "", page = ""] = text.split("#");
  const [total, offset, size] = page.split(":").map(Number);
  const comments = list ? list.split("|").filter(Boolean).map((entry) => {
    const [c, u = ""] = entry.split(":");
    const cm = kv(c, "~");
    const us = kv(u, "~");
    return {
      id: num(cm[6]),
      text: b64text(cm[2]),
      likes: num(cm[4]),
      age: cm[9] || "",
      percent: num(cm[10]) || null,
      levelID: num(cm[1]) || null,
      playerID: num(cm[3]),
      modColor: cm[12] || null,
      spam: cm[7] === "1",
      user: profile ? null : {
        username: us[1], icon: num(us[9], 1), col1: num(us[10]), col2: num(us[11]),
        iconType: num(us[14]), glow: us[15] === "2", accountID: num(us[16]),
      },
    };
  }) : [];
  return { comments, total: total || 0, offset: offset || 0, pageSize: size || 10 };
}

export function parseScores(text) {
  return text.split("|").filter(Boolean).map((s) => parseUser(kv(s)));
}

export function parseMapPacks(text) {
  const [list = "", page = ""] = text.split("#");
  const [total, offset, size] = page.split(":").map(Number);
  return {
    packs: list.split("|").filter(Boolean).map((s) => {
      const p = kv(s);
      return {
        id: num(p[1]), name: p[2], levels: (p[3] || "").split(",").map(Number), stars: num(p[4]), coins: num(p[5]),
        difficulty: num(p[6]), textColor: p[7], barColor: p[17] || p[7],
      };
    }),
    total: total || 0, offset: offset || 0, pageSize: size || 10,
  };
}

export function parseGauntlets(text) {
  const [list = ""] = text.split("#");
  return list.split("|").filter(Boolean).map((s) => {
    const g = kv(s);
    return { id: num(g[1]), levels: (g[3] || "").split(",").map(Number) };
  });
}
