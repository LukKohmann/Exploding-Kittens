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
  const r = crypto.getRandomValues(new Uint8Array(n));
  return [...r].map((x) => a[x % a.length]).join("");
}
const pid = store.get("mb_pid") || (() => { const id = makeId(); store.set("mb_pid", id); return id; })();
let myName = store.get("mb_name") || "";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const roomFromUrl = () => (new URLSearchParams(location.search).get("r") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

let room = roomFromUrl();
let ws = null, wsOpen = false, retry = 0, everConnected = false;
let S = null;            // letzter Spielstand vom Server
let clockOffset = 0;     // Serverzeit - lokale Zeit
let lastLogN = null;
const ui = { selected: new Set(), sheet: null, speer: null, defusePos: null, favorPick: null, discardPick: null };

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
  // Neue Log-Einträge als Toast / Explosion
  const fresh = lastLogN == null ? [] : st.log.filter((l) => l.n > lastLogN);
  lastLogN = st.log.length ? st.log[st.log.length - 1].n : (lastLogN ?? 0);
  for (const l of fresh) {
    if (l.kind === "boom") showBoom(l.text);
    if (["boom", "defused", "win", "attack", "steal", "nope", "private", "big"].includes(l.kind)) toast(l.text, l.kind);
  }
  // Auswahl bereinigen
  const ids = new Set(st.hand.map((c) => c.id));
  for (const id of [...ui.selected]) if (!ids.has(id)) ui.selected.delete(id);
  if (!st.awaiting || st.awaiting.pid !== pid) { ui.speer = null; ui.defusePos = null; ui.favorPick = null; ui.discardPick = null; }
  if (ui.sheet && (ui.sheet.type === "target" || ui.sheet.type === "named") && !canAct()) ui.sheet = null;
  if (prev && prev.current !== st.current && st.current === pid && st.phase === "playing") {
    navigator.vibrate?.(80);
  }
  render();
}

// ------------------------------------------------------------------ Helfer
const me = () => S?.players.find((p) => p.id === pid);
const pname = (id) => (id === pid ? "Du" : S?.players.find((p) => p.id === id)?.name ?? "?");
const isHost = () => S?.hostId === pid;
const myTurn = () => S?.phase === "playing" && S.current === pid;
const canAct = () => myTurn() && !S.pending && !S.awaiting;
const serverNow = () => Date.now() + clockOffset;

function cardHTML(t, { id, cap, size = "", cls = "", tag = "div", attrs = "" } = {}) {
  const c = CARDS[t] || { name: t, emoji: "?", tone: "cat" };
  const capHtml = cap != null ? `<span class="cap ${cap <= 1 ? "urgent" : ""}">☕${cap}</span>` : "";
  return `<${tag} class="card tone-${c.tone} ${size} ${cls}" ${id != null ? `data-id="${id}"` : ""} ${attrs} aria-label="${esc(c.name)}">
    <span class="band"></span><span class="em">${c.emoji}</span><span class="nm">${esc(c.short || c.name)}</span>${capHtml}</${tag}>`;
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
  showBoom.t = setTimeout(() => { $boom.hidden = true; }, 1600);
}

function describeSelection(types) {
  if (!types.length) return null;
  const cls = classifyPlay(types);
  if (types.length === 1) {
    const c = CARDS[types[0]];
    let extra = "";
    if (!cls) {
      if (types[0] === "nope") extra = " Wird gespielt, wenn jemand anderes eine Aktion macht.";
      else if (types[0] === "defuse") extra = " Wird automatisch benutzt.";
      else if (CARDS[types[0]].tone === "cat") extra = " Einzeln nicht spielbar – brauche 2 oder 3 gleiche.";
    }
    return { cls, title: `${c.emoji} ${c.name}`, text: c.text + extra };
  }
  if (!cls) return { cls: null, title: `${types.length} Karten`, text: "Diese Kombi geht nicht. Möglich: 2 gleiche, 3 gleiche oder 5 verschiedene." };
  if (cls.kind === "pair") return { cls, title: "Paar", text: "Klaue einem Mitspieler eine zufällige Karte." };
  if (cls.kind === "triple") return { cls, title: "Drilling", text: "Nenne eine Karte – hat der Mitspieler sie, gehört sie dir." };
  return { cls, title: "5 verschiedene", text: "Nimm dir eine beliebige Karte aus dem Ablagestapel." };
}

// ------------------------------------------------------------------ Ansichten
function render() {
  const handEl = $app.querySelector(".hand");
  const scroll = handEl ? handEl.scrollLeft : 0;
  const sheetEl = document.querySelector(".sheet");
  const sheetScroll = sheetEl ? sheetEl.scrollTop : 0;

  if (!room) $app.innerHTML = homeView();
  else if (!S) $app.innerHTML = `<div class="home"><h1 class="logo">Miau<span>Bumm!</span></h1><p class="tag">${everConnected ? "Lade Spiel …" : "Verbinde …"}</p></div>`;
  else if (S.phase === "lobby") $app.innerHTML = lobbyView();
  else if (S.phase === "over") $app.innerHTML = overView();
  else $app.innerHTML = gameView();

  $app.insertAdjacentHTML("beforeend", sheetView());
  if (room && S && !wsOpen) $app.insertAdjacentHTML("beforeend", `<div class="conn">Verbindung weg – verbinde neu …</div>`);

  const h = $app.querySelector(".hand");
  if (h) h.scrollLeft = scroll;
  const sh = document.querySelector(".sheet");
  if (sh) sh.scrollTop = sheetScroll;
}

function homeView() {
  return `<div class="home">
    <h1 class="logo">Miau<span>Bumm!</span></h1>
    <p class="tag">Das explosive Katzen-Kartenspiel für euch und eure Freunde. Wer die Bombe zieht, fliegt.</p>
    <form class="panel" data-form="home">
      <label class="field">Dein Name
        <input class="text" name="name" maxlength="20" autocomplete="nickname" value="${esc(myName)}" placeholder="z. B. Lukas" required>
      </label>
      <button class="btn primary block" type="submit" name="act" value="create">Neues Spiel erstellen</button>
      <p class="or">oder einem Spiel beitreten</p>
      <div class="row">
        <input class="text code grow" name="code" maxlength="8" placeholder="CODE" autocapitalize="characters" aria-label="Raumcode">
        <button class="btn" type="submit" name="act" value="join">Beitreten</button>
      </div>
    </form>
  </div>`;
}

function lobbyView() {
  const players = S.players.map((p) => `<li>
      <span class="dot ${p.online ? "" : "off"}" title="${p.online ? "online" : "offline"}"></span>
      <span class="nm">${esc(p.name)}${p.id === pid ? " (du)" : ""}</span>
      ${p.id === S.hostId ? `<span class="badge">Gastgeber</span>` : ""}
      ${isHost() && p.id !== pid ? `<button class="btn small" data-act="kick" data-id="${p.id}" aria-label="${esc(p.name)} entfernen">Entfernen</button>` : ""}
    </li>`).join("");
  const n = S.players.length;
  const inRoom = !!me();
  return `<div class="lobby">
    <div class="topbar"><span class="sp"></span><button class="iconbtn" data-act="rules">Karten &amp; Regeln</button></div>
    <div class="roomcode"><div class="lbl">Raumcode</div><div class="val">${esc(S.code)}</div></div>
    <button class="btn block" data-act="share">Einladungslink teilen</button>
    <div class="panel">
      <h2>Spieler (${n}/${RULES.MAX_PLAYERS})</h2>
      <ul class="plist">${players}</ul>
      ${!inRoom ? `<form data-form="joinlobby" class="row"><input class="text grow" name="name" maxlength="20" value="${esc(myName)}" placeholder="Dein Name" required><button class="btn primary">Mitspielen</button></form>` : ""}
      ${isHost()
        ? `<button class="btn primary block" data-act="start" ${n < RULES.MIN_PLAYERS ? "disabled" : ""}>Spiel starten</button>
           ${n < RULES.MIN_PLAYERS ? `<p class="hint">Teile den Link – ab ${RULES.MIN_PLAYERS} Spielern geht's los.</p>` : ""}`
        : inRoom ? `<p class="hint">Warte, bis ${esc(pname(S.hostId))} das Spiel startet.</p>` : ""}
      ${inRoom ? `<button class="linkish" data-act="leave">Raum verlassen</button>` : ""}
    </div>
  </div>`;
}

function overView() {
  const w = S.players.find((p) => p.id === S.winner);
  return `<div class="over">
    <div class="trophy">🏆</div>
    <h2>${w ? (w.id === pid ? "Du hast gewonnen!" : `${esc(w.name)} gewinnt!`) : "Alle explodiert."}</h2>
    ${isHost()
      ? `<div class="row" style="justify-content:center;flex-wrap:wrap"><button class="btn primary" data-act="start">Nochmal spielen</button><button class="btn" data-act="lobby">Zur Lobby</button></div>`
      : `<p>Warte auf ${esc(pname(S.hostId))} für die nächste Runde.</p>`}
    <button class="iconbtn" data-act="log">Spielverlauf ansehen</button>
  </div>`;
}

function statusView() {
  const pd = S.pending, a = S.awaiting;
  if (pd) {
    const tgt = pd.target ? ` gegen ${esc(pname(pd.target))}` : "";
    const named = pd.named ? ` – will ${CARDS[pd.named].emoji} ${esc(CARDS[pd.named].name)}` : "";
    const noped = pd.nopes % 2 === 1;
    return `<div class="status">
      <div>${esc(pname(pd.by))} spielt ${esc(pd.label)}${tgt}${named}</div>
      <div class="sub">${pd.nopes ? `${pd.nopes}× Nö – ${noped ? "aktuell abgewehrt" : "aktuell gilt die Aktion"}. ` : ""}Wer ein Nö! hat, kann jetzt noch stoppen.</div>
      <div class="timer"><i data-deadline="${pd.deadline}" data-span="${RULES.NOPE_MS}"></i></div>
    </div>`;
  }
  if (a) {
    const who = esc(pname(a.pid));
    const txt = {
      favor: `${who} sucht eine Karte für ${esc(pname(a.to))} aus.`,
      defuse: `${who} legt die Bombenkatze geheim zurück …`,
      implode: `${who} legt die Implodierende Katze offen zurück …`,
      speer: `${who} sortiert mit dem Speer die oberen Karten …`,
      discard: `${who} sucht im Ablagestapel …`,
    }[a.kind];
    return `<div class="status ${a.pid === pid ? "mine" : ""}">
      <div>${a.pid === pid ? "Du bist gefragt!" : txt}</div>
      <div class="timer"><i data-deadline="${a.deadline}" data-span="${RULES.CHOICE_MS}"></i></div>
    </div>`;
  }
  if (!me()) return `<div class="status"><div>Du schaust zu.</div><div class="sub">${esc(pname(S.current))} ist dran.</div></div>`;
  if (!me().alive) return `<div class="status"><div>Du bist raus 💥</div><div class="sub">${esc(pname(S.current))} ist dran. Schau zu, wer gewinnt.</div></div>`;
  const turns = S.turnsLeft > 1 ? ` (noch ${S.turnsLeft} Züge)` : "";
  if (myTurn()) return `<div class="status mine"><div>Du bist dran${turns}</div><div class="sub">Spiel beliebig viele Karten. Ziehen beendet deinen Zug.</div></div>`;
  return `<div class="status"><div>${esc(pname(S.current))} ist dran${turns}</div></div>`;
}

function gameView() {
  const players = S.players.map((p) => `<button class="pchip ${p.id === S.current ? "turn" : ""} ${p.alive ? "" : "dead"} ${p.id === pid ? "me" : ""}" data-act="player" data-id="${p.id}">
      ${p.skipTurns ? `<span class="tag2">☕ setzt aus</span>` : ""}
      <div class="nm">${esc(p.name)}</div>
      <div class="meta"><span class="dot ${p.online ? "" : "off"}"></span>${p.alive ? `🂠 ${p.cards}` : "raus"}</div>
    </button>`).join("");

  const top = S.discard[S.discard.length - 1];
  const canDraw = canAct();
  const lastPublic = [...S.log].reverse().find((l) => !l.to);
  const mine = me();
  const myCaps = S.hand.filter((c) => c.t === "cappuccino" && c.cap != null);
  const minCap = myCaps.length ? Math.min(...myCaps.map((c) => c.cap)) : null;

  const hand = S.hand.map((c) => cardHTML(c.t, {
    id: c.id, cap: c.cap, tag: "button",
    cls: `${ui.selected.has(c.id) ? "sel" : ""} ${ui.favorPick === c.id ? "pick" : ""}`,
    attrs: `data-act="card" aria-pressed="${ui.selected.has(c.id)}"`,
  })).join("");

  const types = [...ui.selected].map((id) => S.hand.find((c) => c.id === id)?.t).filter(Boolean);
  const d = describeSelection(types);
  let action = "";
  if (mine?.alive) {
    if (d) {
      action = `<div class="actionbar">
        <div class="desc"><b>${esc(d.title)}</b>${d.cls ? esc(d.text) : `<span class="${types.length > 1 ? "bad" : ""}">${esc(d.text)}</span>`}</div>
        <div class="row">
          <button class="btn primary grow" data-act="play" ${d.cls && canAct() ? "" : "disabled"}>${canAct() ? "Spielen" : "Nicht dein Zug"}</button>
          <button class="btn" data-act="clear">Abwählen</button>
        </div>
      </div>`;
    } else if (canAct()) {
      action = `<div class="actionbar"><div class="row">
        <button class="btn hot grow" data-act="draw">Karte ziehen &amp; Zug beenden</button></div>
        <p class="hint">Oder tippe Karten an, um sie zu spielen.</p></div>`;
    }
  }

  const showNope = S.pending && mine?.alive && S.hand.some((c) => c.t === "nope") && !(S.pending.by === pid && S.pending.nopes % 2 === 0);

  return `
    <div class="topbar">
      <span class="code">${esc(S.code)}</span>
      <span>${S.dir === 1 ? "↻" : "↺"}</span>
      <span class="sp"></span>
      <button class="iconbtn" data-act="log">Verlauf</button>
      <button class="iconbtn" data-act="rules">Regeln</button>
    </div>
    <div class="players">${players}</div>
    <div class="table">
      <button class="pile ${canDraw ? "can" : ""}" data-act="draw" ${canDraw ? "" : "disabled"} aria-label="Karte ziehen">
        <span class="stack"><span><span class="n">${S.deckCount}</span><span class="s">Karten</span></span></span>
        ${S.implodeOnTop ? `<span class="warn">🌀 liegt oben!</span>` : ""}
      </button>
      <div class="discard">${top ? cardHTML(top, { size: "big" }) : `<div class="empty"></div>`}</div>
    </div>
    <div class="tableinfo">💣 ${S.bombsLeft} Bombe${S.bombsLeft === 1 ? "" : "n"} im Stapel</div>
    ${statusView()}
    <div class="ticker">${lastPublic ? esc(lastPublic.text) : ""}</div>
    <div class="handwrap">
      ${S.peek ? `<div class="peek"><b>🔮 Die nächsten Karten (links = oben):</b><div class="cards">${S.peek.map((t) => cardHTML(t, { size: "mini" })).join("")}</div></div>` : ""}
      ${minCap != null ? `<div class="capbar ${minCap <= 1 ? "urgent" : ""}">☕ Cappuccino ablegen: ${minCap <= 1 ? "letzter Zug!" : `noch ${minCap} Züge`}</div>` : ""}
      ${mine ? `<div class="handhead"><span>Deine Hand</span><span class="sub">${S.hand.length} Karten · ❤️ ${S.hand.filter((c) => c.t === "defuse").length}</span></div>
      <div class="hand">${hand || `<p class="hint" style="color:#fff">Keine Karten.</p>`}</div>` : ""}
      ${action}
    </div>
    ${showNope ? `<button class="nopefab" data-act="nope">Nö!</button>` : ""}
  `;
}

// ------------------------------------------------------------------ Sheets
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
      ${esc(p.name)}<span class="sub">${p.cards} Karten</span></button>`).join("")}</div>
    <button class="btn" data-act="close">Abbrechen</button>`;
}

function namedSheet() {
  const types = Object.keys(CARDS).filter((t) => t !== "bomb" && t !== "implode");
  return `<h3>Welche Karte willst du von ${esc(pname(ui.sheet.target))}?</h3>
    <div class="cardgrid">${types.map((t) => cardHTML(t, { size: "mini", tag: "button", attrs: `data-act="named" data-t="${t}"` })).join("")}</div>
    <button class="btn" data-act="close">Abbrechen</button>`;
}

function awaitingSheet(a) {
  if (a.kind === "favor") {
    const to = esc(pname(a.to));
    return `<h3>${to} will einen Gefallen 🎁</h3><p>Such dir aus, welche Karte du abgibst.</p>
      <div class="cardgrid">${S.hand.map((c) => cardHTML(c.t, { id: c.id, size: "mini", tag: "button", cls: ui.favorPick === c.id ? "pick" : "", attrs: `data-act="favorpick"` })).join("")}</div>
      <button class="btn primary block" data-act="favorgive" ${ui.favorPick ? "" : "disabled"}>Karte an ${to} geben</button>`;
  }
  if (a.kind === "defuse" || a.kind === "implode") {
    const n = a.deckCount;
    if (ui.defusePos == null || ui.defusePos > n) ui.defusePos = 0;
    const title = a.kind === "defuse" ? "Puh! Bombe entschärft 💣" : "Implodierende Katze 🌀";
    const text = a.kind === "defuse"
      ? "Lege die Bombenkatze geheim zurück. Wohin? Nur du weißt es."
      : "Sie wird offen zurückgelegt. Liegt sie oben, sehen es alle. Wer sie das nächste Mal zieht, ist sofort raus.";
    return `<h3>${title}</h3><p>${text}</p>
      <div class="poslabel" id="poslabel">${posLabel(ui.defusePos, n)}</div>
      <input type="range" min="0" max="${n}" value="${ui.defusePos}" data-act="pos" aria-label="Position im Stapel">
      <div class="row"><span class="hint grow">oben</span><span class="hint">unten</span></div>
      <div class="row">
        <button class="btn primary grow" data-act="place">Hier hinlegen</button>
        <button class="btn" data-act="placerandom">Zufällig</button>
      </div>`;
  }
  if (a.kind === "speer") {
    if (!ui.speer || ui.speer.length !== a.cards.length) ui.speer = a.cards.map((_, i) => i);
    const rows = ui.speer.map((orig, i) => {
      const t = a.cards[orig];
      return `<div class="speerrow"><span class="pos">${i + 1}</span>${cardHTML(t, { size: "mini" })}<span class="nm">${esc(CARDS[t].name)}</span>
        <span class="mv"><button data-act="sp-up" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="nach oben">▲</button>
        <button data-act="sp-down" data-i="${i}" ${i === ui.speer.length - 1 ? "disabled" : ""} aria-label="nach unten">▼</button></span></div>`;
    }).join("");
    return `<h3>Österreichischer Speer 🗡️</h3><p>Sortiere die oberen ${a.cards.length} Karten. Nummer 1 liegt oben – die ziehst du gleich.</p>
      <div class="speerlist">${rows}</div>
      <button class="btn primary block" data-act="speerdone">Fertig &amp; Karte ziehen</button>`;
  }
  if (a.kind === "discard") {
    return `<h3>Nimm dir eine Karte aus der Ablage</h3>
      <div class="cardgrid">${a.options.map((c) => cardHTML(c.t, { id: c.id, size: "mini", tag: "button", cls: ui.discardPick === c.id ? "pick" : "", attrs: `data-act="discpick"` })).join("")}</div>
      <button class="btn primary block" data-act="disctake" ${ui.discardPick ? "" : "disabled"}>Diese Karte nehmen</button>`;
  }
  return "";
}

function posLabel(p, n) {
  if (p === 0) return "Ganz oben (wird als Nächstes gezogen)";
  if (p === n) return `Ganz unten (Position ${p + 1})`;
  return `Position ${p + 1} von ${n + 1}`;
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
    <p><b>Katzen-Kombos:</b> 2 gleiche = zufällige Karte klauen. 3 gleiche = Karte benennen und klauen. 5 verschiedene = Karte aus der Ablage nehmen. Die Wilde Katze ersetzt jede Katze.</p>
    <dl>${order.map((t) => `<div class="r">${cardHTML(t, { size: "mini" })}<div><dt>${esc(CARDS[t].name)} <span class="hint">${count(t)}</span></dt><dd>${esc(CARDS[t].text)}</dd></div></div>`).join("")}</dl>
  </div><button class="btn" data-act="close">Schließen</button>`;
}

// ------------------------------------------------------------------ Eingaben
function goToRoom(code) {
  room = code;
  history.pushState(null, "", `/?r=${code}`);
  S = null; lastLogN = null;
  if (ws) { ws.onclose = null; ws.close(); }
  connect();
  render();
}
function goHome() {
  room = "";
  history.pushState(null, "", "/");
  if (ws) { ws.onclose = null; ws.close(); }
  ws = null; S = null; wsOpen = false;
  render();
}
window.addEventListener("popstate", () => { const r = roomFromUrl(); if (r !== room) r ? goToRoom(r) : goHome(); });

$app.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const data = new FormData(f);
  const name = String(data.get("name") || "").trim().slice(0, 20);
  if (!name) return toast("Gib einen Namen ein.", "error");
  myName = name; store.set("mb_name", name);
  if (f.dataset.form === "home") {
    const act = e.submitter?.value;
    if (act === "join") {
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
    case "clear": ui.selected.clear(); break;
    case "draw": if (canAct()) { ui.selected.clear(); send("draw"); } return;
    case "nope": send("nope"); return;
    case "play": {
      const ids = [...ui.selected];
      const types = ids.map((x) => S.hand.find((c) => c.id === x)?.t);
      const cls = classifyPlay(types);
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
    const frac = Math.max(0, Math.min(1, left / Number(el.dataset.span)));
    el.style.transform = `scaleX(${frac})`;
  }
  requestAnimationFrame(animateTimers);
}
requestAnimationFrame(animateTimers);

// Start
if (room && !myName) {
  // Einladungslink ohne Namen: Name abfragen
  $app.innerHTML = "";
  room = "";
  render();
  const code = roomFromUrl();
  setTimeout(() => { const i = $app.querySelector('input[name="code"]'); if (i) i.value = code; $app.querySelector('input[name="name"]')?.focus(); }, 0);
} else {
  connect();
  render();
}
