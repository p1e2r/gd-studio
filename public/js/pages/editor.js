import { h, api, go, toast, download, pickFile, state, fmt } from "../core.js";
import { text } from "../gd.js";
import { panel, btn, backButton, spinner, errorPanel, modal } from "../ui.js";
import { Level } from "../editor/level.js";
import { Editor } from "../editor/editor.js";

export default async function editorPage(app, parts) {
  const [a, b] = parts;
  if (!a) return levelList(app);
  if (a === "new") {
    const l = await api("/levels", { json: { name: "Untitled", description: "", data: new Level().serialize() } });
    location.replace(`#/editor/${l.id}`);
    return;
  }
  if (a === "online") return openOnline(app, b);
  return openSaved(app, a);
}

async function levelList(app) {
  app.append(backButton("/"), h("div", { class: "center" }, text("Create", { font: "goldFont", size: 48 })));
  const listEl = h("div", { class: "col", style: { gap: 0 } }, spinner());
  const onlineForm = h("form", { class: "row", onsubmit: (e) => { e.preventDefault(); const v = e.target.id.value.trim(); if (v) go(`/editor/online/${encodeURIComponent(v)}`); } },
    h("input", { class: "gd-input grow", name: "id", placeholder: "Open an online level by ID" }), btn("Open", null, { small: true, color: "cyan" }));
  app.append(panel("",
    h("div", { class: "row center" },
      btn("New Level", () => go("/editor/new")),
      btn("Import .gmd", importGmd, { color: "cyan" }),
      btn("Import from GD save", importFromSave, { color: "pink" }),
      btn("Paste level string", pasteString, { color: "grey" })),
    h("div", { style: { marginTop: "10px" } }, onlineForm),
    h("p", { class: "small muted" }, state.status?.me ? `Levels are saved to your account (${state.status.me.username}) on this server.` : "Levels are saved for this browser. Log in to keep them with your account.")),
  panel("", text("My Levels", { font: "goldFont", size: 30 }), listEl));

  try {
    const levels = await api("/levels");
    listEl.replaceChildren();
    if (!levels.length) listEl.append(h("p", { class: "muted center" }, "No levels yet."));
    for (const l of levels) {
      listEl.append(h("div", { class: "comment" },
        h("div", { class: "body" },
          text(l.name || "Untitled", { font: "bigFont", size: 24 }),
          h("div", { class: "small muted" }, `Edited ${new Date(l.updated).toLocaleString()} · ${fmt(l.size)} chars${l.uploadedID ? ` · uploaded as ${l.uploadedID}` : ""}`)),
        btn("Edit", () => go(`/editor/${l.id}`), { small: true }),
        btn("Delete", async () => { if (!confirm(`Delete "${l.name}"?`)) return; await api(`/levels/${l.id}`, { method: "DELETE" }); go(`/editor?t=${Date.now()}`); }, { small: true, color: "red" })));
    }
  } catch (e) { listEl.replaceChildren(errorPanel(e)); }
}

async function createFrom(data) {
  const l = await api("/levels", { json: data });
  go(`/editor/${l.id}`);
}

async function importGmd() {
  const f = await pickFile(".gmd,.xml");
  if (!f) return;
  try { await createFrom(await api("/gmd/decode", { method: "POST", body: await f.text(), headers: { "Content-Type": "text/plain" } })); } catch (e) { toast(e.message, "error"); }
}

async function pasteString() {
  const s = prompt("Paste a level string (raw or compressed):");
  if (!s) return;
  try {
    const raw = await api("/levelstring/decode", { method: "POST", body: s.trim(), headers: { "Content-Type": "text/plain" } });
    await createFrom({ name: "Imported", description: "", data: raw });
  } catch (e) { toast(e.message, "error"); }
}

async function importFromSave() {
  const f = await pickFile(".dat");
  if (!f) return;
  toast("Reading save file…");
  try {
    const { data } = await api("/save/decode", { method: "POST", body: f, headers: { "Content-Type": "application/octet-stream" } });
    const levels = Object.values(data.LLM_01 || {}).filter((l) => l && typeof l === "object" && l.k2);
    if (!levels.length) return toast("No local levels found. Pick CCLocalLevels.dat (not CCGameManager.dat).", "error");
    let close;
    const list = h("div", { class: "col", style: { gap: 0, maxHeight: "60vh", overflowY: "auto" } }, ...levels.map((l) => h("div", { class: "comment" },
      h("div", { class: "body" }, text(l.k2, { font: "bigFont", size: 20 }), h("div", { class: "small muted" }, l.k1 ? `Uploaded ID ${l.k1}` : "Not uploaded")),
      btn("Import", async () => {
        close();
        const raw = await api("/levelstring/decode", { method: "POST", body: l.k4 || "", headers: { "Content-Type": "text/plain" } });
        let desc = "";
        try { desc = atob(String(l.k3 || "").replace(/-/g, "+").replace(/_/g, "/")); } catch { /* none */ }
        await createFrom({ name: l.k2, description: desc, data: raw, songID: l.k45 || 0, officialSong: l.k8 || 0, uploadedID: l.k1 || null });
      }, { small: true }))));
    close = modal(panel("", h("div", { class: "center" }, text("Your Local Levels", { font: "goldFont", size: 30 })), list,
      h("div", { class: "row center" }, btn("Cancel", () => close(), { small: true, color: "grey" }))));
  } catch (e) { toast(e.message, "error"); }
}

function mount(app, { level, meta, readOnly, onSave }) {
  app.replaceChildren();
  const holder = h("div", { class: "ed-holder" });
  app.append(holder);
  const ed = new Editor(holder, {
    level, meta, readOnly, onSave,
    onExit: () => go("/editor"),
    onExport: async (kind) => {
      const raw = level.serialize();
      if (kind === "string") {
        const enc = await api("/levelstring/encode", { method: "POST", body: raw, headers: { "Content-Type": "text/plain" } });
        try { await navigator.clipboard.writeText(enc); toast("Compressed level string copied", "ok"); } catch { prompt("Copy the level string:", enc); }
        return;
      }
      const xml = await api("/gmd/encode", { json: { name: meta.name, description: meta.description, data: raw, songID: meta.songID, officialSong: meta.officialSong, author: state.status?.me?.username } });
      download(`${(meta.name || "level").replace(/[^\w -]/g, "")}.gmd`, xml, "application/xml");
    },
    onUpload: () => uploadDialog(level, meta, onSave),
  });
  ed.init().catch((e) => { holder.replaceChildren(errorPanel(e)); });
  return ed;
}

async function openSaved(app, id) {
  app.append(spinner());
  let saved;
  try { saved = await api(`/levels/${encodeURIComponent(id)}`); } catch (e) { app.replaceChildren(backButton("/editor"), errorPanel(e)); return; }
  const level = Level.parse(saved.data);
  const meta = { name: saved.name, description: saved.description, songID: saved.songID || 0, officialSong: saved.officialSong || 0, uploadedID: saved.uploadedID || null };
  const ed = mount(app, {
    level, meta, readOnly: false,
    onSave: async (data, m) => { await api(`/levels/${saved.id}`, { method: "PUT", json: { ...m, data } }); },
  });
  return { destroy: () => ed.destroy() };
}

async function openOnline(app, id) {
  app.append(spinner());
  let d;
  try { d = await api(`/level/${encodeURIComponent(id)}/data`); } catch (e) { app.replaceChildren(backButton(-1), errorPanel(e)); return; }
  const level = Level.parse(d.data);
  const readOnly = !(d.copyable || d.mine);
  const meta = { name: d.name, description: "", songID: d.song || 0, officialSong: d.officialSong || 0, uploadedID: d.mine ? d.id : null };
  const ed = mount(app, {
    level, meta, readOnly,
    onSave: async (data, m) => {
      const l = await api("/levels", { json: { ...m, name: d.mine ? m.name : `${m.name} (copy)`, data } });
      toast("Saved a copy to My Levels", "ok");
      go(`/editor/${l.id}`);
    },
  });
  return { destroy: () => ed.destroy() };
}

function uploadDialog(level, meta, onSave) {
  if (!state.status?.me) { toast("Log in first to upload levels", "error"); return; }
  let close;
  const f = (label, el) => h("label", { class: "ed-field" }, h("span", null, label), el);
  const name = h("input", { class: "gd-input", value: meta.name || "", maxlength: 20 });
  const desc = h("textarea", { class: "gd-input", maxlength: 180 }, meta.description || "");
  const copy = h("select", { class: "gd-input" }, h("option", { value: "none" }, "No copy"), h("option", { value: "free" }, "Free copy"), h("option", { value: "password" }, "Password"));
  const pw = h("input", { class: "gd-input", type: "number", placeholder: "6-digit password" });
  const unlisted = h("select", { class: "gd-input" }, h("option", { value: "" }, "Public"), h("option", { value: "1" }, "Unlisted"), h("option", { value: "friends" }, "Friends only"));
  const stars = h("input", { class: "gd-input", type: "number", min: 0, max: 10, value: 0 });
  const length = h("select", { class: "gd-input" }, ...["Tiny", "Short", "Medium", "Long", "XL", "Platformer"].map((n, i) => h("option", { value: i, selected: i === 2 }, n)));
  const update = h("input", { type: "checkbox", checked: !!meta.uploadedID });
  const go2 = async () => {
    try {
      const r = await api("/upload-level", { json: {
        name: name.value, description: desc.value, data: level.serialize(), copy: copy.value === "free" ? "free" : undefined,
        password: copy.value === "password" ? pw.value : undefined, unlisted: unlisted.value || undefined, requestedStars: +stars.value || 0,
        length: +length.value, songID: meta.songID || 0, officialSong: meta.officialSong || 0, twoPlayer: level.header.kA10 === "1",
        levelID: update.checked && meta.uploadedID ? meta.uploadedID : 0,
        coins: level.objects.filter((o) => o.id === 1329).length,
      } });
      meta.uploadedID = r.levelID; meta.name = name.value; meta.description = desc.value;
      await onSave?.(level.serialize(), meta);
      close();
      toast(`Uploaded! Level ID ${r.levelID}`, "ok");
    } catch (e) { toast(e.message, "error"); }
  };
  close = modal(panel("", h("div", { class: "center" }, text("Upload Level", { font: "goldFont", size: 32 })),
    h("div", { class: "col" }, f("Name", name), f("Description", desc), f("Length", length), f("Copy", copy), f("Password", pw), f("Visibility", unlisted), f("Requested stars", stars),
      meta.uploadedID ? f(`Update existing (ID ${meta.uploadedID})`, update) : null,
      h("p", { class: "small muted" }, "GD normally requires verifying a level (beating it) before upload; the server may reject unverified levels or mark them unverified.")),
    h("div", { class: "row center" }, btn("Upload", go2), btn("Cancel", () => close(), { color: "grey", small: true }))));
}
