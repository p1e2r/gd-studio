import { h, api, toast, state } from "../core.js";
import { text } from "../gd.js";
import { panel, btn, backButton } from "../ui.js";
import { refreshStatus } from "../app.js";

const PATHS = [
  ["Windows (Steam)", "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Geometry Dash\\Resources"],
  ["macOS (Steam)", "~/Library/Application Support/Steam/steamapps/common/Geometry Dash/Geometry Dash.app/Contents/Resources"],
  ["Linux (Steam/Proton)", "~/.steam/steam/steamapps/common/Geometry Dash/Resources"],
];

const adminPw = () => document.getElementById("adminpw")?.value || "";

export default async function setup(app) {
  const st = (await refreshStatus()).assets;
  const statusBox = h("div", { class: "col" });
  const show = (s) => {
    statusBox.replaceChildren(
      text(s.ready ? "Assets loaded!" : "GD assets missing", { font: "bigFont", size: 30, color: s.ready ? "#7dff00" : "#ff6060" }),
      s.dir ? h("div", { class: "small" }, `Using: ${s.dir}`) : h("div", { class: "small" }, `Looked in: ${s.searched.join("  and  ")}`),
      h("div", { class: "small" }, `${s.frames} sprites in ${s.sheets} sheets · icons: ${Object.entries(s.iconCounts || {}).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`),
      s.missing.length ? h("div", { class: "small", style: { color: "#ffb0b0" } }, `Required files missing: ${s.missing.join(", ")}`) : null,
      s.missingRecommended.length ? h("div", { class: "small muted" }, `Optional files missing: ${s.missingRecommended.join(", ")}`) : null);
  };
  show(st);

  const upload = h("input", { type: "file", accept: ".zip", style: { display: "none" }, onchange: async () => {
    const f = upload.files[0];
    if (!f) return;
    toast(`Uploading ${(f.size / 1e6).toFixed(0)} MB…`);
    try {
      const r = await api("/setup/upload", { method: "POST", body: f, headers: { "Content-Type": "application/zip", "X-Admin-Password": adminPw() } });
      toast(`Extracted ${r.extracted} files`, "ok");
      show((await refreshStatus()).assets);
    } catch (e) { toast(e.message, "error"); }
  } });

  app.append(backButton("/"), panel("",
    h("div", { class: "center" }, text("Setup", { font: "goldFont", size: 44 })),
    statusBox,
    h("h3", null, "Option 1 — mount your Resources folder (recommended)"),
    h("p", null, "Copy the ", h("b", null, "Resources"), " folder from your Geometry Dash install to the server, then mount it read-only into the container at ", h("code", null, "/gd-resources"), ". In docker-compose.yml:"),
    h("pre", { class: "code" }, "volumes:\n  - /path/on/server/gd-resources:/gd-resources:ro\n  - ./data:/data"),
    h("p", null, "Where to find it:"),
    h("ul", null, PATHS.map(([os, p]) => h("li", null, h("b", null, `${os}: `), h("code", null, p)))),
    h("p", { class: "small muted" }, "Only .png, .plist, .fnt and .mp3 files are used. The -uhd files are enough if you want to copy less."),
    h("h3", null, "Option 2 — upload a zip"),
    h("p", null, "Zip your Resources folder and upload it here. It's extracted into the server's data folder."),
    h("div", { class: "row" },
      btn("Upload Resources.zip", () => upload.click(), { color: "cyan" }),
      btn("Re-check", async () => {
        try { show(await api("/setup/reload", { method: "POST", headers: { "X-Admin-Password": adminPw() } })); await refreshStatus(); toast("Rescanned"); } catch (e) { toast(e.message, "error"); }
      }, { color: "grey" })),
    state.status?.features?.adminPassword ? h("input", { class: "gd-input", id: "adminpw", type: "password", placeholder: "Admin password (ADMIN_PASSWORD)", style: { marginTop: "8px" } }) : h("p", { class: "small muted" }, "Setup actions work from your LAN. Set ADMIN_PASSWORD to allow them through the public URL."),
    upload,
    h("p", { class: "small muted" }, `GD server: ${state.status?.gdServer || "?"}`)));
}
