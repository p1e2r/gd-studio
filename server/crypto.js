import crypto from "node:crypto";
import zlib from "node:zlib";

export const SECRETS = {
  common: "Wmfd2893gb7",
  account: "Wmfv3899gc9",
  level: "Wmfv2898gc9",
  mod: "Wmfp3879gc3",
};

export const XOR_KEYS = {
  message: 14251,
  vaultCodes: 19283,
  challenges: 19847,
  levelPassword: 26364,
  comment: 29481,
  stats: 85271,
  level: 41274,
  rate: 58281,
  likes: 58281,
  gjp: 37526,
};

const SALTS = {
  gjp2: "mI29fmAnxgTs",
  level: "xI25fpAapCQg",
  comment: "xPT6iUrtws0J",
  stats: "xI35fsAapCRg",
  like: "ysg6pUrtjn0J",
  rate: "ysg6pUrtjn0J",
};

export const sha1 = (s) => crypto.createHash("sha1").update(s, "utf8").digest("hex");

export function b64encode(s) {
  return Buffer.from(s, typeof s === "string" ? "utf8" : undefined).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

export function b64decode(s) {
  return Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function xorString(str, key) {
  const k = String(key);
  let out = "";
  for (let i = 0; i < str.length; i++) out += String.fromCharCode(str.charCodeAt(i) ^ k.charCodeAt(i % k.length));
  return out;
}

export const xorEncrypt = (str, key) => b64encode(Buffer.from(xorString(str, key), "latin1"));
export const xorDecrypt = (str, key) => xorString(b64decode(str).toString("latin1"), key);

export const gjp2 = (password) => sha1(password + SALTS.gjp2);

export function randomSeed(len = 10) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[crypto.randomInt(chars.length)];
  return s;
}

export function commentChk({ userName, commentB64, levelID, percent, type = 0 }) {
  // type 0 = level comment; account posts use the same salt with type in 2.2
  return xorEncrypt(sha1(`${userName}${commentB64}${levelID}${percent}${type === 0 ? "" : type}${SALTS.comment}`), XOR_KEYS.comment);
}

// Level upload seed2: 50 evenly spaced chars of the level string
export function levelUploadChk(levelString) {
  let sample = levelString;
  if (levelString.length >= 50) {
    const step = Math.floor(levelString.length / 50);
    sample = "";
    for (let i = 0; i < 50; i++) sample += levelString[i * step];
  }
  return xorEncrypt(sha1(sample + SALTS.level), XOR_KEYS.level);
}

export function statsChk(p) {
  const s = [p.accountID, p.userCoins, p.demons, p.stars, p.coins, p.iconType, p.icon, p.diamonds,
    p.accIcon, p.accShip, p.accBall, p.accBird, p.accDart, p.accRobot, p.accGlow, p.accSpider,
    p.accExplosion, p.dinfo?.length ?? 0, p.moons].join("");
  return xorEncrypt(sha1(s + SALTS.stats), XOR_KEYS.stats);
}

// ---- level strings ----
export function decodeLevelString(data) {
  if (!data) return "";
  if (data.startsWith("kS") || data.includes(";1,")) return data; // already raw
  const buf = b64decode(data);
  try {
    return zlib.gunzipSync(buf).toString("utf8");
  } catch {
    try { return zlib.inflateSync(buf).toString("utf8"); } catch { return zlib.inflateRawSync(buf).toString("utf8"); }
  }
}

export function encodeLevelString(raw) {
  return b64encode(zlib.gzipSync(Buffer.from(raw, "utf8"), { level: 9 }));
}

// ---- save files (CCGameManager.dat / CCLocalLevels.dat) ----
const MAC_KEY = Buffer.from("ipu9TUv54yv]isFMh5@;t.5w34E2Ry@{", "latin1");

export function decodeSave(buf) {
  buf = Buffer.from(buf);
  // Plain XML already?
  const head = buf.subarray(0, 64).toString("latin1");
  if (head.includes("<?xml") || head.includes("<plist")) return { xml: buf.toString("utf8"), format: "xml" };

  // Windows: XOR 11 -> base64 -> gzip
  const x = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) x[i] = buf[i] ^ 11;
  const xs = x.toString("latin1").replace(/\0+$/, "").trim();
  if (/^[A-Za-z0-9_\-+/=]+$/.test(xs.slice(0, 200))) {
    try {
      const xml = zlib.gunzipSync(b64decode(xs)).toString("utf8");
      return { xml, format: "windows" };
    } catch { /* fall through */ }
  }
  // macOS: AES-256-ECB
  try {
    const d = crypto.createDecipheriv("aes-256-ecb", MAC_KEY, null);
    d.setAutoPadding(true);
    const xml = Buffer.concat([d.update(buf), d.final()]).toString("utf8");
    if (xml.includes("<plist") || xml.includes("<?xml")) return { xml, format: "mac" };
  } catch { /* fall through */ }
  throw new Error("Could not decode save file (not a Windows, macOS or plain XML GD save)");
}

export function encodeSave(xml, format) {
  const data = Buffer.from(xml, "utf8");
  if (format === "xml") return data;
  if (format === "mac") {
    const c = crypto.createCipheriv("aes-256-ecb", MAC_KEY, null);
    return Buffer.concat([c.update(data), c.final()]);
  }
  const b = Buffer.from(b64encode(zlib.gzipSync(data)), "latin1");
  for (let i = 0; i < b.length; i++) b[i] ^= 11;
  return b;
}
