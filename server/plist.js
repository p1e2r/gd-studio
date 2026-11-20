// Minimal XML plist reader/writer.
// Handles Apple plists (TexturePacker sprite sheets, animation descs) and the
// short-tag plists Geometry Dash uses in its save files (<k>, <s>, <i>, <r>, <d>, <t/>).

function decodeEntities(s) {
  return s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => {
    switch (e.toLowerCase()) {
      case "lt": return "<";
      case "gt": return ">";
      case "amp": return "&";
      case "quot": return '"';
      case "apos": return "'";
    }
    if (e[1] === "x" || e[1] === "X") return String.fromCodePoint(parseInt(e.slice(2), 16));
    return String.fromCodePoint(parseInt(e.slice(1), 10));
  });
}

export function encodeEntities(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Tokenize into a tree of {tag, children[], text}
function parseXml(xml) {
  const root = { tag: "#root", children: [] };
  const stack = [root];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) {
      const t = m[5];
      if (t.trim()) top.children.push({ tag: "#text", text: decodeEntities(t) });
      else if (top.tag === "string" || top.tag === "s") top.children.push({ tag: "#text", text: t });
      continue;
    }
    if (!m[2]) continue; // pi / comment / doctype
    if (m[1]) {
      // closing
      while (stack.length > 1) {
        const n = stack.pop();
        if (n.tag === m[2]) break;
      }
    } else {
      const node = { tag: m[2], children: [] };
      top.children.push(node);
      if (!m[4]) stack.push(node);
    }
  }
  return root;
}

const textOf = (n) => n.children.filter((c) => c.tag === "#text").map((c) => c.text).join("");

function toValue(n) {
  switch (n.tag) {
    case "dict":
    case "d": {
      const out = {};
      const kids = n.children.filter((c) => c.tag !== "#text");
      for (let i = 0; i < kids.length; i += 2) {
        const k = kids[i];
        if (!k || (k.tag !== "key" && k.tag !== "k")) { i--; continue; }
        const v = kids[i + 1];
        out[textOf(k)] = v ? toValue(v) : null;
      }
      return out;
    }
    case "array":
    case "a":
      return n.children.filter((c) => c.tag !== "#text").map(toValue);
    case "string":
    case "s":
      return textOf(n);
    case "integer":
    case "i":
      return parseInt(textOf(n), 10);
    case "real":
    case "r":
      return parseFloat(textOf(n));
    case "true":
    case "t":
      return true;
    case "false":
    case "f":
      return false;
    case "date":
      return textOf(n);
    case "data":
      return textOf(n).trim();
    default:
      return textOf(n);
  }
}

export function parsePlist(xml) {
  const root = parseXml(xml);
  const plist = root.children.find((c) => c.tag === "plist");
  if (!plist) throw new Error("not a plist");
  const first = plist.children.find((c) => c.tag !== "#text");
  return first ? toValue(first) : null;
}

// Serialize back to GD's short-tag format (used when writing save files).
export function writeGdPlist(obj) {
  const val = (v) => {
    if (v === true) return "<t />";
    if (v === false) return "";
    if (typeof v === "number") return Number.isInteger(v) ? `<i>${v}</i>` : `<r>${v}</r>`;
    if (Array.isArray(v)) return `<a>${v.map(val).join("")}</a>`;
    if (v && typeof v === "object") return dict(v);
    return `<s>${encodeEntities(v ?? "")}</s>`;
  };
  const dict = (o) => {
    let s = "<d>";
    for (const [k, v] of Object.entries(o)) {
      if (v === false) continue; // GD omits false bools
      s += `<k>${encodeEntities(k)}</k>${val(v)}`;
    }
    return s + "</d>";
  };
  return `<?xml version="1.0"?><plist version="1.0" gjver="2.0">${dict(obj)}</plist>`;
}

// "{{1,2},{3,4}}" -> [1,2,3,4]
export function parseBraces(s) {
  if (typeof s !== "string") return [];
  return s.replace(/[{}\s]/g, "").split(",").filter(Boolean).map(Number);
}
