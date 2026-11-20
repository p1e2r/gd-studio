// DOM + fetch + routing helpers
export function h(tag, attrs, ...children) {
  const el = typeof tag === "string" ? document.createElement(tag) : tag;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "html") el.innerHTML = v;
      else if (k in el && typeof v !== "string") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export async function api(path, opts = {}) {
  const init = { ...opts, headers: { ...(opts.headers || {}) } };
  if (opts.json !== undefined) {
    init.method = init.method || "POST";
    init.body = JSON.stringify(opts.json);
    init.headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`/api${path}`, init);
  const type = res.headers.get("content-type") || "";
  const body = type.includes("json") ? await res.json() : opts.blob ? await res.blob() : await res.text();
  if (!res.ok) {
    const err = new Error((body && body.error) || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = body?.code;
    throw err;
  }
  return body;
}

export function toast(msg, kind = "info") {
  const t = document.getElementById("toast");
  const el = h("div", { class: `toast ${kind}` }, msg);
  t.append(el);
  setTimeout(() => el.classList.add("out"), 3200);
  setTimeout(() => el.remove(), 3800);
}

export const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : String(n ?? 0));

export function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [p, q = ""] = raw.split("?");
  return { parts: p.split("/").filter(Boolean).map(decodeURIComponent), query: Object.fromEntries(new URLSearchParams(q)) };
}

export const go = (path) => { location.hash = path; };

export function download(name, data, type = "application/octet-stream") {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const i = h("input", { type: "file", accept, style: { display: "none" } });
    i.onchange = () => { resolve(i.files[0] || null); i.remove(); };
    document.body.append(i);
    i.click();
  });
}

export const store = {
  get(k, d) { try { const v = localStorage.getItem(`gds:${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`gds:${k}`, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

export const state = { status: null };
