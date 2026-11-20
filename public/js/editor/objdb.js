// Object database (from gdrweb's MIT-licensed object data) + categories, hitboxes and trigger fields.

let dbP = null;
export const loadDb = () => (dbP ||= fetch("/data/objects.json").then((r) => r.json()).then(build));

const ORB = /^(ring|gravring|gravJumpRing|dropRing|dashRing|ring_custom)_/;
const PAD = /^(bump|gravbump)_/;
const HAZARD = /^(spike|pit|sawblade|blade|darkblade|lightBlade|blade_b|iceSpike|colorSpike|invis_spike|blackCogwheel|spinBlade|bladeTrap)_/;
const DECO = /^(d_|dA_|gj_|GJBeast|Fire_|waterfall|fireball|lava|explosion|starAnim|waterSplash|chain|rod_|fakeSpike|persp_|gridLine|d_link)/;

export const TABS = [
  ["Blocks", "block"], ["Outlines", "outline"], ["Slopes", "slope"], ["Hazards", "hazard"], ["3D", "3d"],
  ["Portals", "portal"], ["Pads & Orbs", "orb"], ["Deco", "deco"], ["Special", "special"], ["Triggers", "trigger"],
];

export const TRIGGER_NAMES = {
  22: "No Enter", 23: "Enter From Bottom", 24: "Enter From Top", 25: "Enter From Left", 26: "Enter From Right", 27: "Enter Scale Up", 28: "Enter Scale Down",
  29: "BG Color", 30: "Ground Color", 32: "Enable Trail", 33: "Disable Trail", 105: "Obj Color", 744: "3DL Color", 900: "G2 Color", 915: "Line Color",
  899: "Color", 901: "Move", 1006: "Pulse", 1007: "Alpha", 1049: "Toggle", 1268: "Spawn", 1346: "Rotate", 1347: "Follow", 1520: "Shake",
  1585: "Animate", 1595: "Touch", 1611: "Count", 1612: "Hide Player", 1613: "Show Player", 1615: "Counter", 1616: "Stop", 1811: "Instant Count",
  1812: "On Death", 1814: "Follow Player Y", 1815: "Collision", 1816: "Collision Block", 1817: "Pickup", 1818: "BG Effect On", 1819: "BG Effect Off",
  55: "Enter Fade", 56: "Enter Left Fade", 57: "Enter Right Fade", 58: "Enter Hor Fade", 59: "Enter Ver Fade",
};

// legacy fixed-target color triggers
export const LEGACY_COLOR_TARGET = { 29: 1000, 30: 1001, 105: 1004, 744: 1003, 900: 1009, 915: 1002 };

export const EASINGS = ["None", "Ease In Out", "Ease In", "Ease Out", "Elastic In Out", "Elastic In", "Elastic Out", "Bounce In Out", "Bounce In", "Bounce Out", "Exponential In Out", "Exponential In", "Exponential Out", "Sine In Out", "Sine In", "Sine Out", "Back In Out", "Back In", "Back Out"];

const common = [["11", "Touch Triggered", "bool"], ["62", "Spawn Triggered", "bool"], ["87", "Multi Trigger", "bool"]];
const colorFields = [["23", "Target Color ID", "channel"], ["rgb", "Color", "rgb"], ["10", "Fade Time", "num", 0.5], ["35", "Opacity", "num", 1], ["17", "Blending", "bool"], ["15", "Player Color 1", "bool"], ["16", "Player Color 2", "bool"], ["50", "Copy Color ID", "int"]];

export const TRIGGER_FIELDS = {
  899: colorFields,
  901: [["51", "Target Group ID", "int"], ["28", "Move X (30 = 1 block)", "num"], ["29", "Move Y (30 = 1 block)", "num"], ["10", "Move Time", "num", 0.5], ["30", "Easing", "easing"], ["85", "Easing Rate", "num", 2], ["58", "Lock to Player X", "bool"], ["59", "Lock to Player Y", "bool"]],
  1006: [["52", "Target Group (else channel)", "bool"], ["51", "Target ID", "int"], ["rgb", "Color", "rgb"], ["45", "Fade In", "num"], ["46", "Hold", "num"], ["47", "Fade Out", "num"], ["86", "Exclusive", "bool"]],
  1007: [["51", "Target Group ID", "int"], ["35", "Opacity", "num", 1], ["10", "Fade Time", "num", 0.5]],
  1049: [["51", "Target Group ID", "int"], ["56", "Activate Group", "bool"]],
  1268: [["51", "Target Group ID", "int"], ["63", "Delay Time", "num"], ["102", "Editor Disable", "bool"]],
  1346: [["51", "Target Group ID", "int"], ["71", "Center Group ID", "int"], ["68", "Degrees", "num"], ["69", "Times 360", "int"], ["10", "Move Time", "num", 0.5], ["30", "Easing", "easing"], ["70", "Lock Object Rotation", "bool"]],
  1347: [["51", "Target Group ID", "int"], ["71", "Follow Group ID", "int"], ["72", "X Mod", "num", 1], ["73", "Y Mod", "num", 1], ["10", "Move Time", "num"]],
  1520: [["75", "Strength", "num"], ["84", "Interval", "num"], ["10", "Duration", "num"]],
  1585: [["51", "Target Group ID", "int"], ["76", "Animation ID", "int"]],
  1595: [["51", "Target Group ID", "int"], ["81", "Hold Mode", "bool"], ["82", "Toggle Mode (0 toggle,1 on,2 off)", "int"], ["89", "Dual Mode", "bool"]],
  1611: [["80", "Item ID", "int"], ["77", "Target Count", "int"], ["51", "Target Group ID", "int"], ["56", "Activate Group", "bool"], ["104", "Multi Activate", "bool"]],
  1811: [["80", "Item ID", "int"], ["77", "Target Count", "int"], ["51", "Target Group ID", "int"], ["56", "Activate Group", "bool"], ["88", "Comparison (0 =,1 >,2 <)", "int"]],
  1817: [["80", "Item ID", "int"], ["77", "Count", "int"]],
  1812: [["51", "Target Group ID", "int"], ["56", "Activate Group", "bool"]],
  1815: [["80", "Block A ID", "int"], ["95", "Block B ID", "int"], ["51", "Target Group ID", "int"], ["56", "Activate Group", "bool"], ["93", "Trigger On Exit", "bool"]],
  1816: [["80", "Block ID", "int"], ["94", "Dynamic Block", "bool"]],
  1616: [["51", "Target Group ID", "int"]],
  1814: [["51", "Target Group ID", "int"], ["90", "Speed", "num", 1], ["91", "Delay", "num"], ["92", "Offset", "num"], ["105", "Max Speed", "num"], ["10", "Move Time", "num"]],
};
for (const id of Object.keys(LEGACY_COLOR_TARGET)) TRIGGER_FIELDS[id] = colorFields.slice(1);
for (const k of Object.keys(TRIGGER_FIELDS)) TRIGGER_FIELDS[k] = [...TRIGGER_FIELDS[k], ...common];

export const START_POS_FIELDS = [["kA2", "Gamemode", "gamemode"], ["kA4", "Speed", "speed"], ["kA3", "Mini", "bool"], ["kA8", "Dual", "bool"], ["kA11", "Flip Gravity", "bool"], ["kA28", "Mirror", "bool"]];

export const PORTALS = {
  10: { type: "gravity", value: 1 }, 11: { type: "gravity", value: -1 }, 2926: { type: "gravity", value: 0 },
  12: { type: "mode", value: "cube" }, 13: { type: "mode", value: "ship" }, 47: { type: "mode", value: "ball" },
  111: { type: "mode", value: "ufo" }, 660: { type: "mode", value: "wave" }, 745: { type: "mode", value: "robot" },
  1331: { type: "mode", value: "spider" }, 1933: { type: "mode", value: "swing" },
  99: { type: "size", value: 1 }, 101: { type: "size", value: 0.6 },
  45: { type: "mirror", value: true }, 46: { type: "mirror", value: false },
  286: { type: "dual", value: true }, 287: { type: "dual", value: false },
  200: { type: "speed", value: 1 }, 201: { type: "speed", value: 0 }, 202: { type: "speed", value: 2 }, 203: { type: "speed", value: 3 }, 1334: { type: "speed", value: 4 },
  747: { type: "teleport" },
};
export const PADS = { 35: 1.43, 140: 0.92, 1332: 1.82, 67: "flip" };
export const ORBS = { 36: 1.0, 141: 0.72, 1333: 1.38, 84: "flip", 1022: "flipjump", 1330: "down", 1704: "dash", 1751: "dash-flip", 1594: "toggle" };

function firstTexture(o) {
  if (o.texture && o.texture !== "emptyFrame.png") return o.texture;
  for (const c of o.children || []) { const t = firstTexture(c); if (t) return t; }
  return o.texture || "";
}

function category(id, o) {
  const t = firstTexture(o);
  if (id === 31 || id === 1329 || id === 142 || id === 914 || id === 1614 || id === 1275 || id === 1587 || id === 1589) return "special";
  if (t.startsWith("edit_e") || TRIGGER_NAMES[id]) return "trigger";
  if (t.startsWith("portal_") || t.startsWith("boost_")) return "portal";
  if (ORB.test(t) || PAD.test(t)) return "orb";
  if (/^(secretCoin|smallCoin)/.test(t)) return "special";
  if (HAZARD.test(t) || /^pit_\d/.test(t)) return "hazard";
  if (t.startsWith("persp_")) return "3d";
  if (/slope|^triangle|^lighttriangle|^invis_triangle/.test(t)) return "slope";
  if (/^(blockOutline|smallOutline|invisibleOutline)/.test(t)) return "outline";
  if (DECO.test(t)) return "deco";
  if (t === "" || t === "emptyFrame.png") return "deco";
  return "block";
}

export function hitboxType(id, cat) {
  if (PORTALS[id]) return "portal";
  if (PADS[id] !== undefined) return "pad";
  if (ORBS[id] !== undefined) return "orb";
  if (id === 1329 || id === 142 || id === 1614) return "coin";
  if (cat === "block" || cat === "outline") return "solid";
  if (cat === "slope") return "slope";
  if (cat === "hazard") return "hazard";
  return null;
}

function compile(node) {
  if (!node) return null;
  const n = {
    frame: node.texture && node.texture !== "emptyFrame.png" ? node.texture : null,
    x: node.x || 0, y: node.y || 0, rot: node.rot || 0,
    sx: (node.scale_x ?? 1) * (node.flip_x ? -1 : 1), sy: (node.scale_y ?? 1) * (node.flip_y ? -1 : 1),
    ax: node.anchor_x || 0, ay: node.anchor_y || 0, z: node.z || 0,
    color: node.color_type === "Detail" ? 1 : node.color_type === "Black" ? 2 : 0,
    opacity: node.opacity ?? 1,
    back: [], front: [],
  };
  for (const c of node.children || []) {
    const cc = compile(c);
    if (!cc) continue;
    (cc.z < 0 ? n.back : n.front).push(cc);
  }
  n.back.sort((a, b) => a.z - b.z); n.front.sort((a, b) => a.z - b.z);
  return n;
}

function build(raw) {
  const objects = {};
  const byTab = Object.fromEntries(TABS.map(([, k]) => [k, []]));
  for (const [idStr, o] of Object.entries(raw)) {
    const id = Number(idStr);
    const cat = category(id, o);
    const root = compile(o);
    // if every sprite is "detail", treat them as base (same rule as gdrweb)
    let allDetail = true;
    const walk = (n) => { if (n.frame && n.color !== 1) allDetail = false; n.back.forEach(walk); n.front.forEach(walk); };
    walk(root);
    if (allDetail) { const fix = (n) => { if (n.color === 1) n.color = 0; n.back.forEach(fix); n.front.forEach(fix); }; fix(root); }
    objects[id] = {
      id, cat, root, hitbox: hitboxType(id, cat),
      zLayer: o.default_z_layer ?? 5, zOrder: o.default_z_order ?? (cat === "trigger" ? 0 : 2),
      col1: o.default_base_color_channel ?? 1004, col2: o.default_detail_color_channel ?? 0,
      texture: firstTexture(o), editorOnly: cat === "trigger" || id === 31,
    };
    byTab[cat].push(id);
  }
  // start pos first, coins after
  byTab.special.sort((a, b) => (a === 31 ? -1 : b === 31 ? 1 : a - b));
  return { objects, byTab, get: (id) => objects[id] || null };
}
