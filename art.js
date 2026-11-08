// Eigene SVG-Illustrationen für jede Karte. Alles selbst gezeichnet – Stil: flach, dicke Kontur.
const INK = "#2a1709";
const SW = 2.2; // Konturstärke
const st = `stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round" stroke-linecap="round"`;

const FUR = {
  orange: ["#f4a259", "#ffe1c2", "#d9822b"],
  gray: ["#9aa3ad", "#e9edf1", "#6f7882"],
  black: ["#3b3b48", "#6b6b7c", "#22222c"],
  white: ["#f7efe2", "#ffffff", "#d8c9b3"],
  brown: ["#b07a4f", "#ead2b8", "#8a5a34"],
  cream: ["#f3d7a7", "#fff3de", "#d8b179"],
  green: ["#7cc576", "#d4f0cf", "#4f9a4a"],
};

// ---------------------------------------------------------------- Gesichtsteile
function eyes(kind, fur) {
  const pupil = (x) => `<circle cx="${x}" cy="40.5" r="2.3" fill="${INK}"/><circle cx="${x + 0.9}" cy="39.4" r=".8" fill="#fff"/>`;
  const white = (x, rx = 4.2, ry = 4.6) => `<ellipse cx="${x}" cy="40" rx="${rx}" ry="${ry}" fill="#fff" ${st}/>`;
  switch (kind) {
    case "happy": return `<path d="M38 41.5 Q42 36 46 41.5 M54 41.5 Q58 36 62 41.5" fill="none" ${st}/>`;
    case "sleepy": return `<path d="M38 40 Q42 43.5 46 40 M54 40 Q58 43.5 62 40" fill="none" ${st}/>`;
    case "angry": return `${white(42, 3.8, 3.8)}${white(58, 3.8, 3.8)}${pupil(42.6)}${pupil(57.4)}<path d="M36 33.5 L46.5 37 M64 33.5 L53.5 37" fill="none" ${st} stroke-width="2.8"/>`;
    case "scared": return `<circle cx="42" cy="39.5" r="5.6" fill="#fff" ${st}/><circle cx="58" cy="39.5" r="5.6" fill="#fff" ${st}/><circle cx="42" cy="40" r="1.6" fill="${INK}"/><circle cx="58" cy="40" r="1.6" fill="${INK}"/>`;
    case "wild": return `<ellipse cx="42" cy="40" rx="4.6" ry="4.6" fill="#ffd23f" ${st}/><ellipse cx="58" cy="40" rx="4.6" ry="4.6" fill="#ffd23f" ${st}/><ellipse cx="42" cy="40" rx="1.1" ry="3.6" fill="${INK}"/><ellipse cx="58" cy="40" rx="1.1" ry="3.6" fill="${INK}"/>`;
    case "dizzy": return `<path d="M42 40 m-3.5 0 a3.5 3.5 0 1 1 3.5 3.5 a2.2 2.2 0 1 1 1.5 -2.5 M58 40 m-3.5 0 a3.5 3.5 0 1 1 3.5 3.5 a2.2 2.2 0 1 1 1.5 -2.5" fill="none" ${st} stroke-width="1.8"/>`;
    case "wink": return `${white(42)}${pupil(42.4)}<path d="M54 41.5 Q58 36 62 41.5" fill="none" ${st}/>`;
    case "squint": return `${white(42, 4, 2.4)}<circle cx="42.4" cy="40" r="1.8" fill="${INK}"/><path d="M54 40 L62 40" ${st}/><path d="M37 35 L46.5 37.5" ${st} stroke-width="2.6"/>`;
    case "up": return `${white(42)}${white(58)}<circle cx="42.6" cy="38.2" r="2.2" fill="${INK}"/><circle cx="58.6" cy="38.2" r="2.2" fill="${INK}"/>`;
    default: return `${white(42)}${white(58)}${pupil(42.4)}${pupil(58.4)}`;
  }
}

function mouth(kind) {
  switch (kind) {
    case "open": return `<ellipse cx="50" cy="52.5" rx="3.4" ry="4" fill="#6b1f2e" ${st} stroke-width="1.6"/>`;
    case "grin": return `<path d="M44 49.5 Q50 57 56 49.5 Z" fill="#6b1f2e" ${st} stroke-width="1.6"/><path d="M47.5 53.2 Q50 51.6 52.5 53.2 Q50 55.2 47.5 53.2Z" fill="#ff8fa3"/>`;
    case "frown": return `<path d="M46 52.5 Q50 49.5 54 52.5" fill="none" ${st} stroke-width="1.6"/>`;
    case "fangs": return `<path d="M43.5 49.5 Q50 58 56.5 49.5 Z" fill="#6b1f2e" ${st} stroke-width="1.6"/><path d="M45.5 50.2 L47 53 L48.3 50.4 Z M54.5 50.2 L53 53 L51.7 50.4 Z" fill="#fff"/>`;
    case "flat": return `<path d="M46.5 51 L53.5 51" ${st} stroke-width="1.6"/>`;
    case "o": return `<circle cx="50" cy="51.5" r="1.8" fill="#6b1f2e" ${st} stroke-width="1.4"/>`;
    case "none": return "";
    default: return `<path d="M46 50 Q48 52.4 50 50 Q52 52.4 54 50" fill="none" ${st} stroke-width="1.6"/>`;
  }
}

// ---------------------------------------------------------------- Katze
// Sitzende Katze, Mitte bei x=50, Boden bei y=88 (im 100×90-Raster)
export function cat({ x = 50, y = 0, s = 1, fur = "orange", eyes: e = "normal", mouth: m = "smile", stripes = false, blush = false, tail = true, body = true, head = "" } = {}) {
  const [f, belly, dark] = FUR[fur] || FUR.orange;
  const stripeSvg = stripes
    ? `<path d="M50 25 v6 M45 26.5 l1.2 5 M55 26.5 l-1.2 5" ${st.replace(INK, dark)} fill="none" stroke-width="2"/>`
      + (body ? `<path d="M34 70 q5 1 7 4 M66 70 q-5 1 -7 4 M33 79 q5 0 7 3 M67 79 q-5 0 -7 3" fill="none" stroke="${dark}" stroke-width="2.2" stroke-linecap="round"/>` : "")
    : "";
  return `<g transform="translate(${x} ${y}) scale(${s}) translate(-50 0)">
    ${body && tail ? `<path d="M67 83 C84 84 89 66 83 56 C80 51 74.5 54 77.5 58 C81.5 64 79 75 65.5 77" fill="${f}" ${st}/>` : ""}
    ${body ? `<path d="M32 88 C28 66 36 50 50 50 C64 50 72 66 68 88 Z" fill="${f}" ${st}/>
      <path d="M42.5 87 C41 73 44.5 63 50 63 C55.5 63 59 73 57.5 87 Z" fill="${belly}"/>
      <ellipse cx="42" cy="87" rx="6" ry="3.6" fill="${f}" ${st}/><ellipse cx="58" cy="87" rx="6" ry="3.6" fill="${f}" ${st}/>` : ""}
    <path d="M31 40 L29 13.5 L42 25 Q50 23 58 25 L71 13.5 L69 40 Q70 58.5 50 58.5 Q30 58.5 31 40 Z" fill="${f}" ${st}/>
    <path d="M32.3 19 L33.4 30 L39.4 25.2 Z M67.7 19 L66.6 30 L60.6 25.2 Z" fill="#ffb3c1"/>
    ${stripeSvg}
    <ellipse cx="50" cy="49" rx="9" ry="6.5" fill="${belly}" opacity=".85"/>
    ${blush ? `<ellipse cx="36.5" cy="47.5" rx="3.6" ry="2.2" fill="#ff8fa3" opacity=".6"/><ellipse cx="63.5" cy="47.5" rx="3.6" ry="2.2" fill="#ff8fa3" opacity=".6"/>` : ""}
    ${eyes(e, f)}
    <path d="M47.8 45.6 L52.2 45.6 L50 48.4 Z" fill="#ff8fa3" ${st} stroke-width="1.2"/>
    ${mouth(m)}
    <path d="M31 46 l-9 -2.5 M31 49.5 l-9 .8 M69 46 l9 -2.5 M69 49.5 l9 .8" ${st} stroke-width="1.2" fill="none"/>
    ${head}
  </g>`;
}

// ---------------------------------------------------------------- Requisiten
const bomb = (x, y, r = 11) => `<g>
  <path d="M${x + r * .55} ${y - r * .8} q${r * .5} ${-r * .7} ${r * 1.1} ${-r * .5}" fill="none" ${st}/>
  <rect x="${x + r * .25}" y="${y - r * 1.05}" width="${r * .6}" height="${r * .45}" rx="1.5" transform="rotate(35 ${x + r * .55} ${y - r * .8})" fill="#666" ${st}/>
  <circle cx="${x}" cy="${y}" r="${r}" fill="#2f2f3a" ${st}/>
  <ellipse cx="${x - r * .35}" cy="${y - r * .38}" rx="${r * .28}" ry="${r * .18}" fill="#fff" opacity=".55" transform="rotate(-35 ${x} ${y})"/>
  ${spark(x + r * 1.65, y - r * 1.3, r * .55)}</g>`;
const spark = (x, y, r) => `<path d="M${x} ${y - r} L${x + r * .3} ${y - r * .3} L${x + r} ${y} L${x + r * .3} ${y + r * .3} L${x} ${y + r} L${x - r * .3} ${y + r * .3} L${x - r} ${y} L${x - r * .3} ${y - r * .3} Z" fill="#ffd23f" ${st} stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="${r * .3}" fill="#ff7a1a"/>`;
const heart = (x, y, s = 1, fill = "#ff3d6e") => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 6 C-10 -2 -9 -12 -3 -12 C-1 -12 0 -10 0 -9 C0 -10 1 -12 3 -12 C9 -12 10 -2 0 6 Z" fill="${fill}" ${st} stroke-width="${SW / s}"/><path transform="translate(${x} ${y}) scale(${s})" d="M-5 -8 q-1 2 0 4" stroke="#fff" stroke-width="${1.6 / s}" fill="none" stroke-linecap="round" opacity=".8"/>`;
const paw = (x, y, s = 1, rot = 0, fur = "#f4a259") => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
  <path d="M-5 14 L-6 2 Q-7 -8 0 -8 Q7 -8 6 2 L5 14" fill="${fur}" ${st} stroke-width="${SW / s}"/>
  <ellipse cx="0" cy="-1" rx="3.6" ry="3" fill="#ffb3c1"/><circle cx="-4" cy="-6.5" r="1.6" fill="#ffb3c1"/><circle cx="0" cy="-8.2" r="1.6" fill="#ffb3c1"/><circle cx="4" cy="-6.5" r="1.6" fill="#ffb3c1"/></g>`;
const motion = (x, y, flip = 1) => `<path d="M${x} ${y} l${6 * flip} -3 M${x + 1 * flip} ${y + 6} l${7 * flip} 0 M${x} ${y + 12} l${6 * flip} 3" ${st} fill="none" stroke-width="1.8"/>`;
const zz = (x, y) => `<text x="${x}" y="${y}" font-family="Lilita One, Arial Rounded MT Bold, sans-serif" font-size="13" fill="#fff" ${st} stroke-width="1.4" paint-order="stroke">Z</text><text x="${x + 9}" y="${y - 9}" font-family="Lilita One, Arial Rounded MT Bold, sans-serif" font-size="9" fill="#fff" ${st} stroke-width="1.2" paint-order="stroke">z</text>`;
const miniCard = (x, y, rot, fill) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-6" y="-8.5" width="12" height="17" rx="2" fill="${fill}" ${st} stroke-width="1.8"/><circle cx="0" cy="0" r="2.6" fill="#ffd23f" stroke="${INK}" stroke-width="1"/></g>`;
const stars = (pts) => pts.map(([x, y, r]) => `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z" fill="#fff"/>`).join("");

// ---------------------------------------------------------------- Szenen
const scenes = {
  bomb: () => cat({ fur: "black", eyes: "scared", mouth: "open", x: 44 }) + bomb(76, 70, 12) + `<path d="M20 22 q-4 -6 1 -9 M86 30 q4 -5 0 -9" fill="none" ${st} stroke-width="1.6"/>`,
  implode: () => `<path d="M50 46 m0 -4 a4 4 0 1 1 -4 4 a8 8 0 1 1 8 8 a12 12 0 1 1 -12 -12 a16 16 0 1 1 16 16 a20 20 0 1 1 -20 -20 a24 24 0 1 1 24 24" fill="none" stroke="#8a5cf6" stroke-width="4" opacity=".55"/>`
    + cat({ fur: "gray", eyes: "dizzy", mouth: "o", s: .92, y: 6 }),
  defuse: () => cat({ fur: "cream", eyes: "happy", mouth: "grin", blush: true }) + heart(50, 78, 1.25) + paw(34, 80, .7, 25, "#f3d7a7") + paw(66, 80, .7, -25, "#f3d7a7") + stars([[18, 22, 4], [84, 18, 3], [86, 44, 2.5]]),
  slap: () => cat({ fur: "orange", eyes: "angry", mouth: "frown", stripes: true, x: 44 }) + paw(80, 44, 1.4, 25) + motion(86, 22),
  doubleslap: () => cat({ fur: "gray", eyes: "angry", mouth: "fangs" }) + paw(16, 46, 1.25, -25, "#9aa3ad") + paw(84, 46, 1.25, 25, "#9aa3ad") + motion(9, 20, -1) + motion(91, 20),
  targeted: () => `<g opacity=".95"><circle cx="50" cy="44" r="40" fill="#fff" ${st}/><circle cx="50" cy="44" r="30" fill="#ff3d6e" ${st}/><circle cx="50" cy="44" r="20" fill="#fff" ${st}/></g>`
    + cat({ fur: "white", eyes: "squint", mouth: "flat", s: .85, y: 12 }),
  skip: () => `<ellipse cx="50" cy="86" rx="40" ry="6" fill="#3fb6ff" opacity=".35"/>` + cat({ fur: "gray", eyes: "sleepy", mouth: "none", stripes: true }) + zz(70, 26),
  reverse: () => `<path d="M14 40 A36 36 0 0 1 80 22" fill="none" ${st} stroke-width="5"/><path d="M14 40 A36 36 0 0 1 80 22" fill="none" stroke="#3fb6ff" stroke-width="2.6"/><path d="M74 14 L84 23 L72 27 Z" fill="#3fb6ff" ${st}/>`
    + `<path d="M86 52 A36 36 0 0 1 20 70" fill="none" ${st} stroke-width="5"/><path d="M86 52 A36 36 0 0 1 20 70" fill="none" stroke="#3fb6ff" stroke-width="2.6"/><path d="M26 78 L16 69 L28 65 Z" fill="#3fb6ff" ${st}/>`
    + cat({ fur: "brown", eyes: "wink", mouth: "grin", s: .78, y: 18 }),
  bottom: () => cat({ fur: "orange", eyes: "up", mouth: "o", body: false, y: 30 })
    + `<g>${[0, 1, 2].map((i) => `<rect x="${20 + i * 2}" y="${8 + i * 7}" width="60" height="16" rx="3" fill="${["#3a2257", "#2b1840", "#3a2257"][i]}" ${st}/>`).join("")}</g>`,
  favor: () => cat({ fur: "white", eyes: "happy", mouth: "smile", blush: true })
    + `<g><rect x="34" y="62" width="32" height="24" rx="2.5" fill="#ff3d6e" ${st}/><rect x="32" y="56" width="36" height="9" rx="2" fill="#ff5c86" ${st}/><rect x="47" y="56" width="6" height="30" fill="#ffd23f" ${st} stroke-width="1.6"/>
      <path d="M50 56 C42 46 36 52 44 56 M50 56 C58 46 64 52 56 56" fill="#ffd23f" ${st}/></g>`,
  shuffle: () => cat({ fur: "black", eyes: "wild", mouth: "grin", s: .9, y: 9 }) + miniCard(16, 30, -25, "#3fb6ff") + miniCard(84, 26, 20, "#ff7a1a") + miniCard(20, 66, 15, "#2fbf71") + miniCard(82, 64, -18, "#ff3d6e") + `<path d="M28 18 q10 -10 20 -6 M72 16 q-6 -6 -14 -4" fill="none" ${st} stroke-width="1.6" stroke-dasharray="3 3"/>`,
  future: () => cat({ fur: "gray", eyes: "normal", mouth: "o", stripes: true, head: `<path d="M34 24 L50 -6 L66 24 Z" fill="#8a5cf6" ${st}/><circle cx="50" cy="-6" r="3" fill="#ffd23f" ${st} stroke-width="1.4"/>` }) + stars([[40, 8, 2], [60, 14, 2]])
    + `<path d="M36 89 L40 81 L60 81 L64 89 Z" fill="#9b6a3c" ${st}/><circle cx="50" cy="69" r="14" fill="#b9a2ff" ${st}/><ellipse cx="45" cy="64" rx="4.5" ry="3" fill="#fff" opacity=".7"/>` + stars([[53, 72, 3]]),
  speer: () => `<path d="M80 92 L80 8" ${st} stroke-width="5"/><path d="M80 92 L80 8" stroke="#b07a4f" stroke-width="2.4"/><path d="M80 0 L86 12 L80 10 L74 12 Z" fill="#d9dde3" ${st}/><path d="M74 16 h12" ${st} stroke="#e34" stroke-width="3"/>`
    + cat({ fur: "cream", eyes: "happy", mouth: "grin", x: 44, head: `<path d="M32 22 Q31 15 37 14 L63 14 Q69 15 68 22 Z" fill="#3e7d3a" ${st}/><path d="M28 23 Q50 18 72 23 Q50 27 28 23Z" fill="#2f6a2c" ${st}/><path d="M37 17 L63 17" stroke="#e34" stroke-width="2.4"/><path d="M60 14 Q66 0 74 -2 Q68 8 62 15" fill="#fff" ${st} stroke-width="1.5"/>` })
    + paw(76, 56, .75, 0, "#f3d7a7"),
  cappuccino: () => cat({ fur: "brown", eyes: "sleepy", mouth: "smile", x: 36, s: .9, y: 9 })
    + `<path d="M68 22 q-4 -6 0 -12 M76 22 q-4 -6 0 -12" fill="none" ${st} stroke-width="1.6"/>`
    + `<path d="M58 34 L92 34 L88 72 Q87 78 81 78 L69 78 Q63 78 62 72 Z" fill="#fff8ec" ${st}/><path d="M90 42 q10 2 7 12 q-2 6 -9 6" fill="none" ${st} stroke-width="3"/>`
    + `<ellipse cx="75" cy="34" rx="17" ry="5" fill="#c08552" ${st}/><path d="M70 33 q5 -4 10 0 q-5 4 -10 0Z" fill="#fff3de"/><ellipse cx="75" cy="81" rx="22" ry="4" fill="#fff" ${st}/>`,
  nope: () => `<path d="M30 6 L70 6 L92 28 L92 60 L70 82 L30 82 L8 60 L8 28 Z" fill="#ff3d6e" ${st} opacity=".9"/>`
    + cat({ fur: "white", eyes: "angry", mouth: "frown", s: .82, y: 14 }) + paw(50, 74, 1.15, 0, "#f7efe2"),
  cat_sock: () => cat({ fur: "gray", eyes: "normal", mouth: "smile", stripes: true, head: `<path d="M34 22 Q36 6 52 6 Q66 6 66 18 L60 26 Q50 20 40 27 Z" fill="#ff7a1a" ${st}/><path d="M38 14 L64 12 M37 19 L65 17" stroke="#fff" stroke-width="2.4"/><path d="M52 6 Q60 -8 74 -4 Q78 6 66 14" fill="#ff7a1a" ${st}/><circle cx="74" cy="-3" r="4" fill="#fff" ${st} stroke-width="1.4"/>` }),
  cat_pizza: () => cat({ fur: "orange", eyes: "happy", mouth: "grin", stripes: true })
    + `<path d="M50 90 L30 58 Q50 50 70 58 Z" fill="#ffd27a" ${st}/><path d="M30 58 Q50 50 70 58 Q50 46 30 58Z" fill="#d9822b" ${st}/><circle cx="46" cy="66" r="3.4" fill="#e34b4b"/><circle cx="55" cy="72" r="3" fill="#e34b4b"/><circle cx="49" cy="79" r="2.4" fill="#e34b4b"/><path d="M58 80 q2 6 -1 9" stroke="#ffd27a" stroke-width="3" fill="none"/>`,
  cat_beard: () => cat({ fur: "brown", eyes: "sleepy", mouth: "none" })
    + `<path d="M34 48 Q30 62 38 72 Q42 84 50 88 Q58 84 62 72 Q70 62 66 48 Q58 54 50 52 Q42 54 34 48 Z" fill="#fff" ${st}/><path d="M44 60 q2 6 0 12 M56 60 q-2 6 0 12 M50 62 v14" fill="none" stroke="#d8c9b3" stroke-width="1.6"/><path d="M43 50 Q50 46 57 50" fill="#fff" ${st} stroke-width="1.6"/>`,
  cat_cactus: () => `<path d="M14 88 L14 60 Q14 54 19 54 Q24 54 24 60 L24 88 Z" fill="#7cc576" ${st}/><path d="M19 56 v-6 M14 66 h-4 M24 72 h4" ${st} stroke-width="1.4"/>`
    + cat({ fur: "green", eyes: "normal", mouth: "smile", x: 54, head: `<circle cx="50" cy="20" r="4" fill="#ff8fa3" ${st} stroke-width="1.4"/><circle cx="50" cy="20" r="1.5" fill="#ffd23f"/>` })
    + `<path d="M34 64 l-3 -2 M36 74 l-4 0 M74 64 l3 -2 M72 74 l4 0 M54 58 v-3 M44 82 l-2 2" ${st} stroke-width="1.4" transform="translate(4 0)"/>`,
  cat_noodle: () => cat({ fur: "cream", eyes: "happy", mouth: "o", blush: true })
    + `<path d="M50 53.5 Q46 62 52 66 Q57 70 52 76" fill="none" stroke="#ffd27a" stroke-width="3" stroke-linecap="round"/>`
    + `<ellipse cx="50" cy="82" rx="26" ry="7" fill="#fff" ${st}/><path d="M30 80 q4 -6 8 0 q4 -6 8 0 q4 -6 8 0 q4 -6 8 0 q4 -6 8 0" fill="none" stroke="#ffd27a" stroke-width="3.2" stroke-linecap="round"/><circle cx="44" cy="76" r="3" fill="#a3402a" ${st} stroke-width="1.2"/><circle cx="57" cy="77" r="2.6" fill="#a3402a" ${st} stroke-width="1.2"/>`,
  feral: () => cat({ fur: "orange", eyes: "wild", mouth: "fangs", stripes: true }) + `<path d="M31 36 l6 2 M30 42 l6 0 M69 36 l-6 2 M70 42 l-6 0" stroke="#d9822b" stroke-width="2.2" stroke-linecap="round"/>` + motion(10, 54, -1) + motion(90, 54),
};

export function cardArt(type) {
  const scene = scenes[type];
  if (!scene) return "";
  return `<svg viewBox="2 -4 96 94" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${scene()}</svg>`;
}

// ---------------------------------------------------------------- Kartenvorderseite
import { CARDS } from "./cards.js";
const KIND = { bomb: "Gefahr", life: "Rettung", attack: "Angriff", skip: "Ausweichen", steal: "Klauen", future: "Zukunft", special: "Spezial", nope: "Konter", cat: "Katzenkarte" };
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function cardFace(t, { id, cap, cls = "", tag = "div", attrs = "", style = "" } = {}) {
  const c = CARDS[t] || { name: t, emoji: "?", tone: "cat" };
  const capHtml = cap != null ? `<span class="cap ${cap <= 1 ? "urgent" : ""}">☕ ${cap}</span>` : "";
  return `<${tag} class="card t-${c.tone} ${cls}" ${id != null ? `data-id="${id}"` : ""} ${attrs} ${style ? `style="${style}"` : ""} aria-label="${escHtml(c.name)}">
    <span class="in">
      <span class="hd"><span class="ico">${c.emoji}</span><span class="kind">${KIND[c.tone] ?? ""}</span></span>
      <span class="nm">${escHtml(c.short || c.name)}</span>
      <span class="sub">${escHtml(c.sub || "")}</span>
      <span class="art">${cardArt(t)}</span>
    </span>${capHtml}</${tag}>`;
}
