// Tiny JSON-file storage: login sessions and editor levels.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";

const dir = (...p) => path.join(config.dataDir, ...p);
fs.mkdirSync(dir("levels"), { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, value, mode) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value), { mode });
  fs.renameSync(tmp, file);
}

// ---- sessions ----
const sessionsFile = dir("sessions.json");
const sessions = readJson(sessionsFile, {});

export function createSession(info) {
  const id = crypto.randomBytes(32).toString("base64url");
  sessions[id] = { ...info, created: Date.now() };
  writeJson(sessionsFile, sessions, 0o600);
  return id;
}
export const getSession = (id) => (id && sessions[id]) || null;
export function deleteSession(id) {
  if (sessions[id]) { delete sessions[id]; writeJson(sessionsFile, sessions, 0o600); }
}

// ---- editor levels (one folder per owner: account or anonymous browser) ----
const clean = (s) => String(s).replace(/[^\w-]/g, "");
const ownerDir = (owner) => { const d = dir("levels", clean(owner)); fs.mkdirSync(d, { recursive: true }); return d; };
const levelPath = (owner, id) => path.join(ownerDir(owner), `${clean(id)}.json`);

export function listLevels(owner) {
  const d = ownerDir(owner);
  return fs.readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => {
    const l = readJson(path.join(d, f), null);
    if (!l) return null;
    const { data, ...meta } = l;
    return { ...meta, size: data?.length ?? 0 };
  }).filter(Boolean).sort((a, b) => b.updated - a.updated);
}
export const getLevel = (owner, id) => readJson(levelPath(owner, id), null);
export function saveLevel(owner, level) {
  const id = level.id || crypto.randomBytes(6).toString("hex");
  const prev = getLevel(owner, id) || {};
  const out = { ...prev, ...level, id, updated: Date.now(), created: prev.created || Date.now() };
  writeJson(levelPath(owner, id), out);
  return out;
}
export function deleteLevel(owner, id) {
  try { fs.unlinkSync(levelPath(owner, id)); return true; } catch { return false; }
}
