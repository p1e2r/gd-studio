import { h, api, go, toast } from "../core.js";
import { text } from "../gd.js";
import { panel, btn, backButton } from "../ui.js";
import { refreshStatus } from "../app.js";

export default async function login(app) {
  const form = h("form", { class: "col", style: { maxWidth: "420px", margin: "0 auto" }, onsubmit: async (e) => {
    e.preventDefault();
    const b = e.target.querySelector("button");
    b.disabled = true;
    try {
      const r = await api("/login", { json: { username: e.target.u.value.trim(), password: e.target.p.value } });
      await refreshStatus();
      toast(`Logged in as ${r.username}`, "ok");
      go("/");
    } catch (err) {
      toast(err.message, "error");
    } finally { b.disabled = false; }
  } },
  h("input", { class: "gd-input", name: "u", placeholder: "Username", autocomplete: "username", required: true }),
  h("input", { class: "gd-input", name: "p", type: "password", placeholder: "Password", autocomplete: "current-password", required: true }),
  btn("Login", null));
  app.append(backButton("/"), panel("", h("div", { class: "center" }, text("Login", { font: "goldFont", size: 44 })), form,
    h("p", { class: "small muted center" }, "Your password is never stored. The server keeps only your account ID and gjp2 (a password-equivalent hash) in its private data folder so it can post comments and upload levels for you.")));
}
