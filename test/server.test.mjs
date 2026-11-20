import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { start, requests } from "./mock-gd-server.mjs";
import { gjp2, xorEncrypt, xorDecrypt, encodeLevelString, decodeLevelString, encodeSave, decodeSave, levelUploadChk } from "../server/crypto.js";
import { parsePlist, writeGdPlist } from "../server/plist.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gds-test-"));
const res = path.join(tmp, "res");
let mock, app;
const PORT = 3911, MOCK = 4911;
const base = `http://127.0.0.1:${PORT}`;

before(async () => {
  execFileSync(process.execPath, [new URL("./make-fake-resources.mjs", import.meta.url).pathname, res]);
  mock = start(MOCK);
  app = spawn(process.execPath, [new URL("../server/index.js", import.meta.url).pathname], {
    env: { ...process.env, PORT, RESOURCES_DIR: res, DATA_DIR: path.join(tmp, "data"), GD_SERVER: `http://127.0.0.1:${MOCK}/database`, GD_MIN_INTERVAL_MS: "50", API_PER_MINUTE: "40" },
    stdio: "pipe",
  });
  await new Promise((r) => app.stdout.on("data", (d) => String(d).includes("GD Studio on") && r()));
});
after(() => { app?.kill(); mock?.close(); });

test("crypto round trips", () => {
  assert.match(gjp2("password"), /^[0-9a-f]{40}$/);
  assert.equal(xorDecrypt(xorEncrypt("hello123", 26364), 26364), "hello123");
  const raw = "kA2,0;1,1,2,15,3,15;";
  assert.equal(decodeLevelString(encodeLevelString(raw)), raw);
  for (const fmt of ["windows", "mac", "xml"]) {
    const xml = writeGdPlist({ playerName: "Andrew", GS_value: { 6: "100" }, playerGlow: true, n: 5 });
    const back = decodeSave(encodeSave(xml, fmt));
    assert.equal(back.format, fmt);
    const d = parsePlist(back.xml);
    assert.equal(d.playerName, "Andrew");
    assert.equal(d.playerGlow, true);
    assert.equal(d.n, 5);
  }
  assert.ok(levelUploadChk("x".repeat(500)).length > 10);
});

test("GD requests are form-encoded POSTs with an empty User-Agent and the secret", async () => {
  const r = await fetch(`${base}/api/search?str=blood`).then((x) => x.json());
  assert.equal(r.levels[0].name, "Bloodbath");
  assert.equal(r.levels[0].author, "RobTop");
  const req = requests.find((x) => x.url.endsWith("getGJLevels21.php"));
  assert.equal(req.headers["content-type"], "application/x-www-form-urlencoded");
  assert.equal(req.headers["user-agent"] ?? "", "");
  assert.equal(req.params.secret, "Wmfd2893gb7");
});

test("responses are cached", async () => {
  const before = requests.filter((x) => x.url.endsWith("getGJUserInfo20.php")).length;
  await fetch(`${base}/api/profile/RobTop`);
  await fetch(`${base}/api/profile/RobTop`);
  const afterN = requests.filter((x) => x.url.endsWith("getGJUserInfo20.php")).length;
  assert.equal(afterN - before, 1);
});

test("level data decodes", async () => {
  const d = await fetch(`${base}/api/level/128/data`).then((x) => x.json());
  assert.ok(d.data.includes(";1,901,"));
  assert.equal(d.copyable, true);
});

test("login, comment and upload use the account secret and chk", async () => {
  const login = await fetch(`${base}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "RobTop", password: "pw" }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const lreq = requests.find((x) => x.url.endsWith("loginGJAccount.php"));
  assert.equal(lreq.params.secret, "Wmfv3899gc9");
  assert.equal(lreq.params.gjp2, gjp2("pw"));
  assert.equal(lreq.params.password, undefined);
  const c = await fetch(`${base}/api/comment`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ levelID: 128, text: "hi" }) }).then((x) => x.json());
  assert.equal(c.id, 123);
  const u = await fetch(`${base}/api/upload-level`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ name: "T", data: "kA2,0;1,1,2,15,3,15;" }) }).then((x) => x.json());
  assert.equal(u.levelID, 99999);
});

test("editor levels are private per visitor", async () => {
  const a = await fetch(`${base}/api/levels`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "a", data: "x;" }) });
  const cookieA = a.headers.get("set-cookie").split(";")[0];
  const listA = await fetch(`${base}/api/levels`, { headers: { cookie: cookieA } }).then((x) => x.json());
  assert.equal(listA.length, 1);
  const listB = await fetch(`${base}/api/levels`).then((x) => x.json());
  assert.equal(listB.length, 0);
});

test("setup is locked behind Cloudflare without ADMIN_PASSWORD", async () => {
  const r = await fetch(`${base}/api/setup/reload`, { method: "POST", headers: { "CF-Connecting-IP": "1.2.3.4" } });
  assert.equal(r.status, 403);
  const ok = await fetch(`${base}/api/setup/reload`, { method: "POST" });
  assert.equal(ok.status, 200);
});

test("sprites are cut from sheets (incl. rotated frames)", async () => {
  const r = await fetch(`${base}/sprite/GJ_arrow_01_001.png`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png");
});

test("per-visitor rate limit returns 429", async () => {
  let last = 200;
  for (let i = 0; i < 60 && last !== 429; i++) last = (await fetch(`${base}/api/gauntlets`, { headers: { "CF-Connecting-IP": "9.9.9.9" } })).status;
  assert.equal(last, 429);
});
