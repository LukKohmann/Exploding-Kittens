import { CARDS, CAT_TYPES, GAME_NAME, RULES, classifyPlay, DECK_COUNTS } from "./cards.js";

// ------------------------------------------------------------------ Grundlagen
const $app = document.getElementById("app");
const $toasts = document.getElementById("toasts");
const $boom = document.getElementById("boom");

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
function makeId(n = 20) {
  const a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return [...crypto.getRandomValues(new Uint8Array(n))].map((x) => a[x % a.length]).join("");
}
const pid = store.get("mb_pid") || (() => { const id = makeId(); store.set("mb_pid", id); return id; })();
let myName = store.get("mb_name") || "";
if (store.get("mb_portrait") === "1") document.body.classList.add("portrait-ok");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const roomFromUrl = () => (new URLSearchParams(location.search).get("r") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

let room = roomFromUrl();
let ws = null, wsOpen = false, retry = 0, everConnected = false;
let S = null;            // letzter Spielstand vom Server
let clockOffset = 0;     // Serverzeit - lokale Zeit
let lastLogN = null;
const ui = { selected: new Set(), sheet: null, speer: null, defusePos: null, favorPick: null, discardPick: null };
const anim = { seen: null, discardSig: null, risk: 0 };

const AVATARS = ["🐱", "🦊", "🐼", "🐸", "🐵", "🐨", "🐰", "🐷"];
const AV_COLORS = ["#19b3a6", "#ff7a1a", "#8a5cf6", "#2fbf71", "#3fb6ff", "#ff3d6e", "#e0a100", "#9b6a3c"];
const KIND = { bomb: "Gefahr", life: "Rettung", attack: "Angriff", skip: "Ausweichen", steal: "Klauen", future: "Zukunft", special: "Spezial", nope: "Konter", cat: "Katze" };

// ------------------------------------------------------------------ Verbindung
function connect() {
  if (!room) return;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws/${room}`);
  ws.onopen = () => {
    wsOpen = true; retry = 0; everConnected = true;
    ws.send(JSON.stringify({ type: "hello", pid, name: myName }));
    render();
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "state") onState(msg.state);
    else if (msg.type === "error") toast(msg.msg, "error");
  };
  ws.onclose = () => {
    wsOpen = false;
    if (!room) return;
    render();
    setTimeout(connect, Math.min(8000, 800 * 2 ** retry++));
  };
}
function send(type, data = {}) {
  if (!wsOpen) { toast("Keine Verbindung – versuche es gleich nochmal.", "error"); return; }
  ws.send(JSON.stringify({ type, ...data }));
}
setInterval(() => { if (wsOpen) ws.send(JSON.stringify({ type: "ping" })); }, 25000);

function onState(st) {
  clockOffset = st.now - Date.now();
  const prev = S;
  S = st;
  const fresh = lastLogN == null ? [] : st.log.filter((l) => l.n > lastLogN);
  lastLogN = st.log.length ? st.log[st.log.length - 1].n : (lastLogN ?? 0);
  for (const l of fresh) {
    if (l.kind === "boom") showBoom(l.text);
    if (["boom", "defused", "win", "attack", "steal", "nope", "private", "big"].includes(l.kind)) toast(l.text, l.kind);
  }
  const ids = new Set(st.hand.map((c) => c.id));
  for (const id of [...ui.selected]) if (!ids.has(id)) ui.selected.delete(id);
  if (!st.awaiting || st.awaiting.pid !== pid) { ui.speer = null; ui.defusePos = null; ui.favorPick = null; ui.discardPick = null; }
  if (ui.sheet && (ui.sheet.type === "target" || ui.sheet.type === "named") && !canAct()) ui.sheet = null;
  if (st.phase !== "playing") anim.seen = null;
  if (prev && prev.current !== st.current && st.current === pid && st.phase === "playing") navigator.vibrate?.(80);
  render();
}

// ------------------------------------------------------------------ Helfer
const me = () => S?.players.find((p) => p.id === pid);
const pname = (id) => (id === pid ? "Du" : S?.players.find((p) => p.id === id)?.name ?? "?");
const isHost = () => S?.hostId === pid;
const myTurn = () => S?.phase === "playing" && S.current === pid;
const canAct = () => myTurn() && !S.pending && !S.awaiting;
const serverNow = () => Date.now() + clockOffset;
const seat = (id) => Math.max(0, S.players.findIndex((p) => p.id === id));

function avatarHTML(id, extra = "") {
  const i = seat(id) % AVATARS.length;
  return `<span class="av ${extra}" style="--avc:${AV_COLORS[i]}">${AVATARS[i]}</span>`;
}

function cardHTML(t, { id, cap, cls = "", tag = "div", attrs = "", style = "" } = {}) {
  const c = CARDS[t] || { name: t, emoji: "?", tone: "cat" };
  let art = `<span class="e">${c.emoji}</span>`;
  if (CAT_TYPES.includes(t)) art = `<span class="e">🐱</span><span class="acc">${c.emoji}</span>`;
  if (t === "bomb") art = `<span class="e">😾</span><span class="acc">💣</span>`;
  if (t === "implode") art = `<span class="e">🙀</span><span class="acc">🌀</span>`;
  const capHtml = cap != null ? `<span class="cap ${cap <= 1 ? "urgent" : ""}">☕${cap}</span>` : "";
  return `<${tag} class="card t-${c.tone} ${cls}" ${id != null ? `data-id="${id}"` : ""} ${attrs} ${style ? `style="${style}"` : ""} aria-label="${esc(c.name)}">
    <span class="hd"><span class="ico">${c.emoji}</span><span class="kind">${KIND[c.tone] ?? ""}</span></span>
    <span class="nm">${esc(c.short || c.name)}</span>
    <span class="art">${art}</span>${capHtml}</${tag}>`;
}

function toast(text, kind = "info") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = text;
  $toasts.appendChild(el);
  while ($toasts.children.length > 3) $toasts.firstChild.remove();
  setTimeout(() => el.remove(), kind === "error" ? 3500 : 3000);
}

function showBoom(text) {
  $boom.innerHTML = `<div class="word">BUMM!<span class="who">${esc(text.replace(/^[^\p{L}]+/u, ""))}</span></div>`;
  $boom.hidden = false;
  $boom.style.animation = "none"; void $boom.offsetWidth; $boom.style.animation = "";
  navigator.vibrate?.([120, 60, 220]);
  clearTimeout(showBoom.t);
  showBoom.t = setTimeout(() => { $boom.hidden = true; }, 1700);
}

function describeSelection(types) {
  if (!types.length) return null;
  const cls = classifyPlay(types);
  if (types.length === 1) {
    const c = CARDS[types[0]];
    let extra = "";
    if (!cls) {
      if (types[0] === "nope") extra = " Spielst du, wenn jemand eine Aktion macht.";
      else if (types[0] === "defuse") extra = " Wird automatisch benutzt.";
      else if (c.tone === "cat") extra = " Allein nicht spielbar.";
    }
    return { cls, title: c.name, text: c.text + extra };
  }
  if (!cls) return { cls: null, title: `${types.length} Karten`, text: "Diese Kombi geht nicht. Möglich: 2 gleiche, 3 gleiche oder 5 verschiedene." };
  if (cls.kind === "pair") return { cls, title: "Paar", text: "Klaue einem Mitspieler eine zufällige Karte." };
  if (cls.kind === "triple") return { cls, title: "Drilling", text: "Nenne eine Karte – hat der Mitspieler sie, gehört sie dir." };
  return { cls, title: "5 verschiedene", text: "Nimm dir eine Karte aus der Ablage." };
}

// ------------------------------------------------------------------ Rendern
function render() {
  const sheetEl = document.querySelector(".sheet");
  const sheetScroll = sheetEl ? sheetEl.scrollTop : 0;

  if (!room) $app.innerHTML = homeView();
  else if (!S) $app.innerHTML = `<div class="screen"><div><h1 class="logo">Miau<span>Bumm! <span class="bomb">💣</span></span></h1><p class="tag">${everConnected ? "Lade Spiel …" : "Verbinde …"}</p></div></div>`;
  else if (S.phase === "lobby") $app.innerHTML = lobbyView();
  else if (S.phase === "over") $app.innerHTML = overView();
  else $app.innerHTML = boardView();

  $app.insertAdjacentHTML("beforeend", sheetView());
  if (room && S && !wsOpen) $app.insertAdjacentHTML("beforeend", `<div class="conn">Verbindung weg – verbinde neu …</div>`);
  const sh = document.querySelector(".sheet");
  if (sh) sh.scrollTop = sheetScroll;
  afterRender();
}

function afterRender() {
  // Zeiger der Risiko-Anzeige weich bewegen
  const needle = $app.querySelector(".needle");
  if (needle) {
    const target = Number(needle.dataset.angle);
    needle.style.transition = "none";
    needle.style.transform = `rotate(${anim.risk}deg)`;
    void needle.getBoundingClientRect();
    needle.style.transition = "";
    needle.style.transform = `rotate(${target}deg)`;
    anim.risk = target;
  }
}

// Fächer-Positionen für die Hand berechnen
function handGeometry(n) {
  const w = window.innerWidth, h = window.innerHeight;
  const portrait = h > w && w <= 700;
  const clamp = (a, x, b) => Math.max(a, Math.min(b, x));
  const ch = portrait ? clamp(90, h * 0.19, 150) : clamp(92, h * 0.27, 196);
  const cw = ch * 0.7;
  const left = portrait ? 10 : clamp(48, h * 0.15, 104) + 28 + cw * 0.3;
  const right = portrait ? 10 : clamp(130, w * 0.22, 240) + 22 + cw * 0.35;
  const avail = Math.max(cw, w - left - right);
  const step = n > 1 ? Math.min(cw * 0.9, (avail - cw) / (n - 1)) : 0;
  const width = cw + step * (n - 1);
  return { ch, cw, step, width, x: left + (avail - width) / 2 - 10 };
}

function homeView() {
  return `<div class="screen"><div class="home">
    <div>
      <h1 class="logo">Miau<span>Bumm! <span class="bomb">💣</span></span></h1>
      <p class="tag">Das explosive Katzen-Kartenspiel für dich und deine Freunde. Wer die Bombe zieht, fliegt.</p>
    </div>
    <form class="panel" data-form="home">
      <label class="field">Dein Name
        <input class="text" name="name" maxlength="20" autocomplete="nickname" value="${esc(myName)}" placeholder="z. B. Lukas" required>
      </label>
      <button class="btn gold block" type="submit" name="act" value="create">Neues Spiel erstellen</button>
      <p class="or">oder einem Spiel beitreten</p>
      <div class="row">
        <input class="text code grow" name="code" maxlength="8" placeholder="CODE" autocapitalize="characters" aria-label="Raumcode" value="${esc(roomFromUrl())}">
        <button class="btn" type="submit" name="act" value="join">Beitreten</button>
      </div>
    </form>
  </div></div>`;
}

function lobbyView() {
  const players = S.players.map((p) => `<li>
      ${avatarHTML(p.id)}
      <span class="nm">${esc(p.name)}${p.id === pid ? " (du)" : ""}</span>
      <span class="dot ${p.online ? "" : "off"}" title="${p.online ? "online" : "offline"}"></span>
      ${p.id === S.hostId ? `<span class="badge">Gastgeber</span>` : ""}
      ${isHost() && p.id !== pid ? `<button class="btn wood" style="color:var(--ink);background:#f3e4cf" data-act="kick" data-id="${p.id}" aria-label="${esc(p.name)} entfernen">✕</button>` : ""}
    </li>`).join("");
  const n = S.players.length;
  const inRoom = !!me();
  return `<div class="screen"><div class="lobby">
    <div style="display:grid;gap:14px;justify-items:start">
      <div class="roomcode"><div class="lbl">Raumcode</div><div class="val stroke">${esc(S.code)}</div></div>
      <button class="btn gold" data-act="share">Einladungslink teilen</button>
      <button class="btn wood" data-act="rules">Karten &amp; Regeln</button>
    </div>
    <div class="panel">
      <h2>Spieler (${n}/${RULES.MAX_PLAYERS})</h2>
      <ul class="plist">${players}</ul>
      ${!inRoom ? `<form data-form="joinlobby" class="row"><input class="text grow" name="name" maxlength="20" value="${esc(myName)}" placeholder="Dein Name" required><button class="btn gold">Mitspielen</button></form>` : ""}
      ${isHost()
        ? `<button class="btn green block" data-act="start" ${n < RULES.MIN_PLAYERS ? "disabled" : ""}>Spiel starten</button>
           ${n < RULES.MIN_PLAYERS ? `<p class="hint">Teile den Link – ab ${RULES.MIN_PLAYERS} Spielern geht's los.</p>` : ""}`
        : inRoom ? `<p class="hint">Warte, bis ${esc(pname(S.hostId))} das Spiel startet.</p>` : ""}
      ${inRoom ? `<button class="linkish" data-act="leave">Raum verlassen</button>` : ""}
    </div>
  </div></div>`;
}

function overView() {
  const w = S.players.find((p) => p.id === S.winner);
  return `<div class="over">
    <div class="trophy">🏆</div>
    ${w ? avatarHTML(w.id) : ""}
    <h2 class="stroke">${w ? (w.id === pid ? "Du hast gewonnen!" : `${esc(w.name)} gewinnt!`) : "Alle explodiert."}</h2>
    ${isHost()
      ? `<div class="row" style="justify-content:center;flex-wrap:wrap"><button class="btn gold" data-act="start">Nochmal spielen</button><button class="btn" data-act="lobby">Zur Lobby</button></div>`
      : `<p>Warte auf ${esc(pname(S.hostId))} für die nächste Runde.</p>`}
    <button class="btn wood" data-act="log">Spielverlauf</button>
  </div>`;
}

function statusHTML() {
  const pd = S.pending, a = S.awaiting;
  if (pd) {
    const tgt = pd.target ? ` → ${esc(pname(pd.target))}` : "";
    const noped = pd.nopes % 2 === 1;
    return `<div class="big stroke">${esc(pname(pd.by))}: ${esc(pd.label)}${tgt}</div>
      <div class="sub">${pd.nopes ? `${pd.nopes}× Nö – ${noped ? "gerade abgewehrt" : "gilt gerade"}. ` : ""}Noch kurz Zeit für ein Nö!</div>
      <div class="timer"><i data-deadline="${pd.deadline}" data-span="${RULES.NOPE_MS}"></i></div>`;
  }
  if (a) {
    const who = esc(pname(a.pid));
    const txt = {
      favor: `${who} sucht eine Karte für ${esc(pname(a.to))} aus`,
      defuse: `${who} versteckt die Bombe im Stapel`,
      implode: `${who} legt die Implodierende Katze zurück`,
      speer: `${who} sortiert mit dem Speer`,
      discard: `${who} wühlt in der Ablage`,
    }[a.kind];
    return `<div class="big stroke">${a.pid === pid ? "Du bist gefragt!" : txt + " …"}</div>
      <div class="timer"><i data-deadline="${a.deadline}" data-span="${RULES.CHOICE_MS}"></i></div>`;
  }
  const turns = S.turnsLeft > 1 ? `<div class="sub">noch ${S.turnsLeft} Züge</div>` : "";
  if (!me()) return `<div class="big stroke">${esc(pname(S.current))} ist dran</div><div class="sub">Du schaust zu.</div>`;
  if (!me().alive) return `<div class="big stroke">Du bist raus 💥</div><div class="sub">${esc(pname(S.current))} ist dran.</div>`;
  if (myTurn()) return `<div class="big stroke" style="color:var(--gold)">Du bist dran!</div>${turns}<div class="sub">Karten spielen – oder ziehen, um den Zug zu beenden.</div>`;
  return `<div class="big stroke">${esc(pname(S.current))} ist dran</div>${turns}`;
}

function gaugeHTML() {
  const risk = S.implodeOnTop ? 1 : S.deckCount ? S.bombsLeft / S.deckCount : 0;
  const angle = -90 + 180 * risk;
  const pct = Math.round(risk * 100);
  const arc = (from, to, col) => {
    const L = Math.PI * 50;
    return `<path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="${col}" stroke-width="16" stroke-dasharray="0 ${L * from} ${L * (to - from)} ${L}"/>`;
  };
  return `<div class="gauge">
    <div class="lbl stroke">Bomben-Risiko</div>
    <svg viewBox="0 0 120 70" aria-hidden="true">
      <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="#2a1709" stroke-width="22" stroke-linecap="round"/>
      ${arc(0, .34, "#ffd23f")}${arc(.33, .67, "#ff7a1a")}${arc(.66, 1, "#ff3d6e")}
      <g class="needle" data-angle="${angle}"><line x1="60" y1="60" x2="60" y2="17" stroke="#2a1709" stroke-width="6" stroke-linecap="round"/><line x1="60" y1="60" x2="60" y2="19" stroke="#fff8ec" stroke-width="2.5" stroke-linecap="round"/></g>
      <circle cx="60" cy="60" r="8" fill="#ff3d6e" stroke="#2a1709" stroke-width="3"/>
    </svg>
    <div class="pct stroke">${pct}%</div>
  </div>`;
}

function boardView() {
  const mine = me();
  const myIdx = S.players.findIndex((p) => p.id === pid);
  const others = myIdx >= 0 ? [...S.players.slice(myIdx + 1), ...S.players.slice(0, myIdx)] : S.players;

  const opps = others.map((p) => {
    const k = Math.min(p.cards, 7);
    const backs = Array.from({ length: k }, (_, j) => `<i style="transform:rotate(${(j - (k - 1) / 2) * 11}deg)"></i>`).join("");
    const isTurn = p.id === S.current;
    return `<button class="opp ${isTurn ? "turn" : ""} ${p.alive ? "" : "dead"}" data-act="player" data-id="${p.id}">
      <span class="nm stroke">${esc(p.name)}</span>
      ${avatarHTML(p.id)}
      ${p.online ? "" : `<span class="off" title="offline"></span>`}
      ${p.skipTurns ? `<span class="pill">☕ setzt aus</span>` : ""}
      ${p.alive ? `<span class="fan">${backs}<b>${p.cards}</b></span>` : ""}
      ${isTurn && S.turnsLeft > 1 ? `<span class="turnflag">${S.turnsLeft} Züge</span>` : ""}
    </button>`;
  }).join("");

  // Ablage mit "Landen"-Animation, wenn sich die oberste Karte ändert
  const disc = S.discard;
  const sig = disc.length + ":" + disc.slice(-3).join(",");
  const landed = anim.discardSig != null && anim.discardSig !== sig;
  anim.discardSig = sig;
  const tops = disc.slice(-3);
  const discardCards = tops.map((t, i) => {
    const rot = ((disc.length - tops.length + i) * 47 % 17) - 8;
    return cardHTML(t, { cls: i === tops.length - 1 && landed ? "landed" : "", style: `transform:rotate(${rot}deg)` });
  }).join("");

  // Hand
  const hand = S.hand;
  const g = handGeometry(hand.length);
  const mid = (hand.length - 1) / 2;
  const spread = Math.min(5, 34 / Math.max(1, hand.length));
  const newIds = anim.seen ? hand.filter((c) => !anim.seen.has(c.id)).map((c) => c.id) : [];
  anim.seen = new Set(hand.map((c) => c.id));
  const handHtml = hand.map((c, i) => {
    const off = i - mid;
    const sel = ui.selected.has(c.id);
    const y = (off * off - mid * mid) * g.ch * 0.01 + g.ch * 0.04 - (sel ? g.ch * 0.22 : 0);
    return cardHTML(c.t, {
      id: c.id, cap: c.cap, tag: "button",
      cls: `${sel ? "sel" : ""} ${newIds.includes(c.id) ? "drawn" : ""}`,
      attrs: `data-act="card" aria-pressed="${sel}"`,
      style: `left:${i * g.step}px;transform:translateY(${y}px) rotate(${off * spread}deg);z-index:${i + 1}`,
    });
  }).join("");

  const types = [...ui.selected].map((id) => hand.find((c) => c.id === id)?.t).filter(Boolean);
  const d = describeSelection(types);
  const showNope = S.pending && mine?.alive && hand.some((c) => c.t === "nope") && !(S.pending.by === pid && S.pending.nopes % 2 === 0);
  const myCaps = hand.filter((c) => c.t === "cappuccino" && c.cap != null);
  const minCap = myCaps.length ? Math.min(...myCaps.map((c) => c.cap)) : null;
  const lives = hand.filter((c) => c.t === "defuse").length;
  const lastPublic = S.log.filter((l) => !l.to).slice(-2);

  let actions = "";
  if (mine?.alive) {
    if (showNope) actions += `<button class="nope" data-act="nope">Nö!</button>`;
    if (d) actions += `<div class="selinfo"><b>${esc(d.title)}</b>${d.cls ? esc(d.text) : `<span class="${types.length > 1 ? "bad" : ""}">${esc(d.text)}</span>`}</div>`;
    if (d && d.cls && canAct()) actions += `<button class="btn gold block" data-act="play">Spielen</button>`;
    if (canAct()) actions += `<button class="btn hot block" data-act="draw">Ziehen</button>`;
  }

  const canDraw = canAct();
  const fsOk = document.documentElement.requestFullscreen && !document.fullscreenElement && matchMedia("(pointer: coarse)").matches;

  return `<div class="board">
    <div class="corner l">
      <button class="btn wood" data-act="menu">☰ ${esc(S.code)}</button>
      ${fsOk ? `<button class="btn wood" data-act="fullscreen" aria-label="Vollbild">⛶</button>` : ""}
    </div>
    <div class="corner r">
      <button class="btn wood" data-act="log">Verlauf</button>
      <button class="btn wood" data-act="rules">Regeln</button>
    </div>

    <div class="opps">${opps}</div>

    <div class="center">
      <div style="justify-self:end;display:grid;gap:8px;justify-items:center">
        ${gaugeHTML()}
        ${S.peek ? `<div class="peek"><span class="t">🔮 Oben →</span><div class="cards">${S.peek.map((t) => cardHTML(t, { cls: "mini", style: "--ch:64px" })).join("")}</div></div>` : ""}
      </div>
      <button class="deck ${canDraw ? "can" : ""}" data-act="draw" ${canDraw ? "" : "disabled"} aria-label="Karte ziehen">
        <span class="back cardback"></span><span class="back cardback"></span><span class="back cardback"></span>
        ${S.implodeOnTop ? `<span class="warn">🌀 liegt oben!</span>` : ""}
        <span class="count stroke">${S.deckCount} Karten</span>
      </button>
      <div class="discard"><span class="slot"></span>${discardCards}</div>
      <div class="side">
        <div class="banner-inline">${statusHTML()}</div>
        <div class="ticker">${lastPublic.map((l) => esc(l.text)).join("<br>")}</div>
      </div>
    </div>

    <div class="bottom">
      ${mine ? `<div class="me ${myTurn() ? "turn" : ""} ${mine.alive ? "" : "dead"}">
        ${avatarHTML(pid)}
        <div class="info">
          <span class="chip">❤️ ${lives}</span>
          ${minCap != null ? `<span class="chip cap ${minCap <= 1 ? "urgent" : ""}" title="Cappuccino ablegen">☕ ${minCap <= 1 ? "letzter Zug!" : `noch ${minCap}`}</span>` : ""}
        </div>
      </div>` : ""}
      <div class="hand" style="left:${g.x}px;width:${g.width}px;transform:none;--ch:${g.ch}px">${handHtml || (mine?.alive ? `<span class="empty stroke">Keine Karten</span>` : "")}</div>
      <div class="actions">${actions}</div>
    </div>
  </div>
  <div class="rotate"><div><span class="phone">📱</span><p>Dreh dein Handy quer – dann hast du den ganzen Spieltisch im Blick.</p><button class="btn gold" data-act="portraitok">Hochkant weiterspielen</button></div></div>`;
}

// ------------------------------------------------------------------ Dialoge
function sheetView() {
  if (!S) return "";
  const a = S.awaiting;
  if (S.phase === "playing" && a && a.pid === pid) return wrap(awaitingSheet(a), false);
  if (!ui.sheet) return "";
  const t = ui.sheet.type;
  if (t === "target") return wrap(targetSheet());
  if (t === "named") return wrap(namedSheet());
  if (t === "log") return wrap(logSheet());
  if (t === "rules") return wrap(rulesSheet());
  if (t === "menu") return wrap(menuSheet());
  return "";
}
const wrap = (inner, closable = true) =>
  `<div class="scrim" ${closable ? `data-act="close"` : ""}><div class="sheet" role="dialog" aria-modal="true">${inner}</div></div>`;

function targetSheet() {
  const { cls } = ui.sheet;
  const others = S.players.filter((p) => p.alive && p.id !== pid);
  const q = cls.kind === "pair" ? "Wem klaust du eine zufällige Karte?"
    : cls.kind === "triple" ? "Wen nimmst du ins Visier?"
    : { favor: "Wer muss dir einen Gefallen tun?", targeted: "Wen greifst du an? (2 Züge)", cappuccino: "Wer setzt einen Zug aus?" }[cls.card] || "Wähle einen Mitspieler";
  return `<h3>${q}</h3>
    <div class="choices">${others.map((p) => `<button class="choice" data-act="target" data-id="${p.id}" ${cls.needsCards && !p.cards ? "disabled" : ""}>
      ${avatarHTML(p.id)}${esc(p.name)}<span class="sub">${p.cards} 🂠</span></button>`).join("")}</div>
    <button class="btn" data-act="close">Abbrechen</button>`;
}

function namedSheet() {
  const types = Object.keys(CARDS).filter((t) => t !== "bomb" && t !== "implode");
  return `<h3>Welche Karte willst du von ${esc(pname(ui.sheet.target))}?</h3>
    <div class="cardgrid">${types.map((t) => cardHTML(t, { cls: "mini", tag: "button", attrs: `data-act="named" data-t="${t}"` })).join("")}</div>
    <button class="btn" data-act="close">Abbrechen</button>`;
}

function menuSheet() {
  return `<h3>Raum ${esc(S.code)}</h3>
    <button class="btn gold block" data-act="share">Einladungslink teilen</button>
    ${isHost() ? `<button class="btn block" data-act="lobbyconfirm">Spiel abbrechen &amp; zur Lobby</button>` : ""}
    <button class="btn block" data-act="exit">Zur Startseite</button>
    <p class="hint">Tipp: Als Gastgeber kannst du Spieler, die weg sind, durch Antippen ihres Avatars aus dem Spiel nehmen.</p>
    <button class="btn" data-act="close">Zurück zum Spiel</button>`;
}

function awaitingSheet(a) {
  if (a.kind === "favor") {
    const to = esc(pname(a.to));
    return `<h3>${to} will einen Gefallen 🎁</h3><p>Such dir aus, welche Karte du abgibst.</p>
      <div class="cardgrid">${S.hand.map((c) => cardHTML(c.t, { id: c.id, cls: `mini ${ui.favorPick === c.id ? "pick" : ""}`, tag: "button", attrs: `data-act="favorpick"` })).join("")}</div>
      <button class="btn gold block" data-act="favorgive" ${ui.favorPick ? "" : "disabled"}>Karte an ${to} geben</button>`;
  }
  if (a.kind === "defuse" || a.kind === "implode") {
    const n = a.deckCount;
    if (ui.defusePos == null || ui.defusePos > n) ui.defusePos = 0;
    const title = a.kind === "defuse" ? "Puh! Bombe entschärft 💣" : "Implodierende Katze 🌀";
    const text = a.kind === "defuse"
      ? "Versteck die Bombenkatze im Stapel. Nur du weißt, wo sie liegt."
      : "Sie kommt offen zurück in den Stapel. Wer sie das nächste Mal zieht, ist sofort raus.";
    return `<h3>${title}</h3><p>${text}</p>
      <div class="poslabel" id="poslabel">${posLabel(ui.defusePos, n)}</div>
      <input type="range" min="0" max="${n}" value="${ui.defusePos}" data-act="pos" aria-label="Position im Stapel">
      <div class="row"><span class="hint grow">oben</span><span class="hint">unten</span></div>
      <div class="row">
        <button class="btn gold grow" data-act="place">Hier verstecken</button>
        <button class="btn" data-act="placerandom">Zufällig</button>
      </div>`;
  }
  if (a.kind === "speer") {
    if (!ui.speer || ui.speer.length !== a.cards.length) ui.speer = a.cards.map((_, i) => i);
    const cols = ui.speer.map((orig, i) => `<div class="speercol"><span class="pos">${i === 0 ? "oben" : i + 1}</span>${cardHTML(a.cards[orig], { cls: "mini" })}
        <span class="mv"><button data-act="sp-up" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="weiter nach oben">◀</button>
        <button data-act="sp-down" data-i="${i}" ${i === ui.speer.length - 1 ? "disabled" : ""} aria-label="weiter nach unten">▶</button></span></div>`).join("");
    return `<h3>Österreichischer Speer 🗡️</h3><p>Sortiere die oberen ${a.cards.length} Karten. Die linke liegt oben – die ziehst du gleich.</p>
      <div class="speerlist">${cols}</div>
      <button class="btn gold block" data-act="speerdone">Fertig &amp; Karte ziehen</button>`;
  }
  if (a.kind === "discard") {
    return `<h3>Nimm dir eine Karte aus der Ablage</h3>
      <div class="cardgrid">${a.options.map((c) => cardHTML(c.t, { id: c.id, cls: `mini ${ui.discardPick === c.id ? "pick" : ""}`, tag: "button", attrs: `data-act="discpick"` })).join("")}</div>
      <button class="btn gold block" data-act="disctake" ${ui.discardPick ? "" : "disabled"}>Diese Karte nehmen</button>`;
  }
  return "";
}

function posLabel(p, n) {
  if (p === 0) return "Ganz oben – wird als Nächstes gezogen";
  if (p === n) return `Ganz unten (Platz ${p + 1})`;
  return `Platz ${p + 1} von ${n + 1}`;
}

function logSheet() {
  const items = [...S.log].reverse().map((l) => `<li class="${l.to ? "private" : ""} ${l.kind === "boom" ? "boom" : ""}">${esc(l.text)}</li>`).join("");
  return `<div class="logsheet"><h3>Spielverlauf</h3><ol>${items}</ol></div><button class="btn" data-act="close">Schließen</button>`;
}

function rulesSheet() {
  const order = ["bomb", "implode", "defuse", "nope", "slap", "doubleslap", "targeted", "skip", "reverse", "bottom", "favor", "shuffle", "future", "speer", "cappuccino", ...CAT_TYPES, "feral"];
  const count = (t) => DECK_COUNTS[t] ? `${DECK_COUNTS[t]}×` : "";
  return `<div class="rules"><h3>So geht ${esc(GAME_NAME)}</h3>
    <p>Bist du dran, spielst du beliebig viele Karten – oder keine. Dann ziehst du eine Karte vom Stapel, das beendet deinen Zug. Ziehst du eine Bombenkatze und hast keinen Entschärfer, bist du raus. Wer als Letztes übrig ist, gewinnt.</p>
    <p style="margin:10px 0"><b>Katzen-Kombos:</b> 2 gleiche = zufällige Karte klauen. 3 gleiche = Karte benennen und klauen. 5 verschiedene = Karte aus der Ablage nehmen. Die Wilde Katze ersetzt jede Katze.</p>
    <dl>${order.map((t) => `<div class="r">${cardHTML(t, { cls: "mini", style: "--ch:78px" })}<div><dt>${esc(CARDS[t].name)} <span class="hint">${count(t)}</span></dt><dd>${esc(CARDS[t].text)}</dd></div></div>`).join("")}</dl>
  </div><button class="btn" data-act="close">Schließen</button>`;
}

// ------------------------------------------------------------------ Eingaben
function goToRoom(code) {
  room = code;
  history.pushState(null, "", `/?r=${code}`);
  S = null; lastLogN = null; anim.seen = null; anim.discardSig = null;
  if (ws) { ws.onclose = null; ws.close(); }
  connect();
  render();
}
function goHome() {
  room = "";
  history.pushState(null, "", "/");
  if (ws) { ws.onclose = null; ws.close(); }
  ws = null; S = null; wsOpen = false; ui.sheet = null;
  render();
}
window.addEventListener("popstate", () => { const r = roomFromUrl(); if (r !== room) r ? goToRoom(r) : goHome(); });
let resizeT;
window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(render, 120); });

$app.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const data = new FormData(f);
  const name = String(data.get("name") || "").trim().slice(0, 20);
  if (!name) return toast("Gib einen Namen ein.", "error");
  myName = name; store.set("mb_name", name);
  if (f.dataset.form === "home") {
    if (e.submitter?.value === "join") {
      const code = String(data.get("code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code.length < 4) return toast("Der Code hat mindestens 4 Zeichen.", "error");
      goToRoom(code);
    } else {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      goToRoom([...crypto.getRandomValues(new Uint8Array(4))].map((x) => alphabet[x % alphabet.length]).join(""));
    }
  } else if (f.dataset.form === "joinlobby") {
    send("hello", { pid, name });
  }
});

$app.addEventListener("input", (e) => {
  if (e.target.dataset.act === "pos") {
    ui.defusePos = Number(e.target.value);
    const lbl = document.getElementById("poslabel");
    if (lbl) lbl.textContent = posLabel(ui.defusePos, S.awaiting.deckCount);
  }
});

$app.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (act === "close" && el.classList.contains("scrim") && e.target !== el) return;
  const id = el.dataset.id;

  switch (act) {
    case "close": ui.sheet = null; break;
    case "rules": ui.sheet = { type: "rules" }; break;
    case "log": ui.sheet = { type: "log" }; break;
    case "menu": ui.sheet = { type: "menu" }; break;
    case "exit": ui.sheet = null; goHome(); return;
    case "lobbyconfirm": if (confirm("Laufendes Spiel abbrechen?")) { ui.sheet = null; send("lobby"); } return;
    case "portraitok": document.body.classList.add("portrait-ok"); store.set("mb_portrait", "1"); return;
    case "fullscreen":
      try { await document.documentElement.requestFullscreen(); await screen.orientation?.lock?.("landscape"); } catch {}
      render(); return;
    case "share": {
      const url = `${location.origin}/?r=${S.code}`;
      try {
        if (navigator.share) await navigator.share({ title: GAME_NAME, text: `Spiel mit mir ${GAME_NAME}! Code: ${S.code}`, url });
        else { await navigator.clipboard.writeText(url); toast("Link kopiert."); }
      } catch {}
      return;
    }
    case "start": send("start"); return;
    case "lobby": send("lobby"); return;
    case "leave": send("leave"); setTimeout(goHome, 150); return;
    case "kick": {
      const p = S.players.find((x) => x.id === id);
      if (p && confirm(`${p.name} entfernen?`)) send("kick", { target: id });
      return;
    }
    case "player": {
      const p = S.players.find((x) => x.id === id);
      if (isHost() && p && p.id !== pid && p.alive && confirm(`${p.name} aus dem Spiel nehmen? (z. B. wenn die Person weg ist)`)) send("kick", { target: id });
      return;
    }
    case "card": {
      const cid = Number(id);
      ui.selected.has(cid) ? ui.selected.delete(cid) : ui.selected.add(cid);
      break;
    }
    case "draw": if (canAct()) { ui.selected.clear(); send("draw"); } return;
    case "nope": send("nope"); return;
    case "play": {
      const ids = [...ui.selected];
      const cls = classifyPlay(ids.map((x) => S.hand.find((c) => c.id === x)?.t));
      if (!cls) return;
      if (cls.target) { ui.sheet = { type: "target", cls, cardIds: ids }; break; }
      send("play", { cardIds: ids }); ui.selected.clear();
      break;
    }
    case "target": {
      const { cls, cardIds } = ui.sheet;
      if (cls.named) { ui.sheet = { type: "named", cls, cardIds, target: id }; break; }
      send("play", { cardIds, target: id }); ui.selected.clear(); ui.sheet = null;
      break;
    }
    case "named": {
      const { cardIds, target } = ui.sheet;
      send("play", { cardIds, target, named: el.dataset.t }); ui.selected.clear(); ui.sheet = null;
      break;
    }
    case "favorpick": ui.favorPick = Number(id); break;
    case "favorgive": if (ui.favorPick) send("respond", { cardId: ui.favorPick }); return;
    case "place": send("respond", { position: ui.defusePos ?? 0 }); return;
    case "placerandom": send("respond", { position: "random" }); return;
    case "sp-up": case "sp-down": {
      const i = Number(el.dataset.i), j = act === "sp-up" ? i - 1 : i + 1;
      [ui.speer[i], ui.speer[j]] = [ui.speer[j], ui.speer[i]];
      break;
    }
    case "speerdone": send("respond", { order: ui.speer }); return;
    case "discpick": ui.discardPick = Number(id); break;
    case "disctake": if (ui.discardPick) send("respond", { cardId: ui.discardPick }); return;
    default: return;
  }
  render();
});

// Timerbalken flüssig animieren, ohne neu zu rendern
function animateTimers() {
  for (const el of document.querySelectorAll("[data-deadline]")) {
    const left = Number(el.dataset.deadline) - serverNow();
    el.style.transform = `scaleX(${Math.max(0, Math.min(1, left / Number(el.dataset.span)))})`;
  }
  requestAnimationFrame(animateTimers);
}
requestAnimationFrame(animateTimers);

// Start: Einladungslink ohne gespeicherten Namen → erst Namen abfragen
if (room && !myName) { room = ""; render(); setTimeout(() => $app.querySelector('input[name="name"]')?.focus(), 0); }
else { connect(); render(); }
