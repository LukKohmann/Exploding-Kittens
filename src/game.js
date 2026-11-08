// Reine Spiellogik – kein Netzwerk, kein Cloudflare. Dadurch lokal testbar.
import { CARDS, DECK_COUNTS, RULES, classifyPlay } from "../public/cards.js";

export class GameError extends Error {}

const fail = (msg) => { throw new GameError(msg); };
const now = () => Date.now();

function rnd(n) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createRoom(code) {
  return {
    code, phase: "lobby", hostId: null, players: [], deck: [], discard: [],
    nextId: 1, current: 0, dir: 1, turnsLeft: 1, attacked: false,
    pending: null, awaiting: null, winner: null, log: [], logN: 0, round: 0,
    lastActivity: now(),
  };
}

function log(s, text, kind = "info", to = null) {
  s.log.push({ n: ++s.logN, text, kind, ...(to ? { to } : {}) });
  if (s.log.length > 80) s.log.splice(0, s.log.length - 80);
}

const P = (s, id) => s.players.find((p) => p.id === id);
const cur = (s) => s.players[s.current];
const cname = (t) => CARDS[t]?.name ?? t;
const aliveCount = (s) => s.players.filter((p) => p.alive).length;

function nextAliveIndex(s, from) {
  const n = s.players.length;
  let i = from;
  for (let k = 0; k < n; k++) {
    i = (i + s.dir + n) % n;
    if (s.players[i].alive) return i;
  }
  return from;
}

function newCard(s, t) { return { id: s.nextId++, t }; }

function receive(p, card) {
  delete card.faceUp;
  if (card.t === "cappuccino") { card.cap = RULES.CAPPUCCINO_TURNS; card.fresh = true; }
  else { delete card.cap; delete card.fresh; }
  p.hand.push(card);
}

function toDiscard(s, card) {
  delete card.cap; delete card.fresh; delete card.faceUp;
  s.discard.push(card);
}

// ---------------------------------------------------------------- Lobby

export function addPlayer(s, pid, name) {
  name = String(name || "").trim().slice(0, 20) || "Spieler";
  const existing = P(s, pid);
  if (existing) { existing.name = name; return true; }
  if (s.phase !== "lobby") return false; // Zuschauer
  if (s.players.length >= RULES.MAX_PLAYERS) fail("Der Raum ist voll.");
  s.players.push({ id: pid, name, hand: [], alive: true, skipTurns: 0, peek: null });
  if (!s.hostId) s.hostId = pid;
  log(s, `${name} ist beigetreten.`);
  return true;
}

export function leave(s, pid) {
  if (s.phase !== "lobby") fail("Während des Spiels kannst du nicht austreten.");
  const i = s.players.findIndex((p) => p.id === pid);
  if (i < 0) return;
  const [p] = s.players.splice(i, 1);
  log(s, `${p.name} hat den Raum verlassen.`);
  if (s.hostId === pid) s.hostId = s.players[0]?.id ?? null;
}

export function kick(s, byPid, targetPid) {
  if (byPid !== s.hostId) fail("Nur der Gastgeber kann Spieler entfernen.");
  if (targetPid === byPid) fail("Du kannst dich nicht selbst entfernen.");
  const t = P(s, targetPid);
  if (!t) return;
  if (s.phase !== "playing") {
    s.players = s.players.filter((p) => p.id !== targetPid);
    log(s, `${t.name} wurde entfernt.`);
    return;
  }
  if (!t.alive) return;
  const wasCurrent = cur(s).id === targetPid;
  if (s.awaiting && s.awaiting.pid === targetPid) {
    const a = s.awaiting;
    if (a.kind === "defuse" || a.kind === "implode") s.deck.splice(rnd(s.deck.length + 1), 0, a.card);
    s.awaiting = null;
  }
  if (s.pending && s.pending.by === targetPid) s.pending = null;
  eliminate(s, t, `${t.name} wurde vom Gastgeber aus dem Spiel genommen.`);
  if (s.phase === "playing" && wasCurrent) advance(s, nextAliveIndex(s, s.current), 1, false);
}

export function startGame(s, byPid) {
  if (byPid !== s.hostId) fail("Nur der Gastgeber kann starten.");
  if (s.phase === "playing") fail("Das Spiel läuft schon.");
  const n = s.players.length;
  if (n < RULES.MIN_PLAYERS) fail(`Mindestens ${RULES.MIN_PLAYERS} Spieler nötig.`);
  const sets = n > 5 ? 2 : 1;

  const pool = [];
  for (const [t, c] of Object.entries(DECK_COUNTS)) for (let i = 0; i < c * sets; i++) pool.push(newCard(s, t));
  shuffle(pool);

  for (const p of s.players) {
    p.alive = true; p.skipTurns = 0; p.peek = null;
    p.hand = pool.splice(0, RULES.HAND_SIZE);
    p.hand.push(newCard(s, "defuse"));
    for (const c of p.hand) if (c.t === "cappuccino") c.cap = RULES.CAPPUCCINO_TURNS;
  }
  const totalDefuse = RULES.DEFUSES_PER_SET * sets - n;
  const extraDefuse = n <= 3 ? Math.min(2, totalDefuse) : Math.max(0, totalDefuse);
  for (let i = 0; i < extraDefuse; i++) pool.push(newCard(s, "defuse"));
  const bombs = Math.max(1, n - 2);
  for (let i = 0; i < bombs; i++) pool.push(newCard(s, "bomb"));
  pool.push(newCard(s, "implode"));

  s.deck = shuffle(pool);
  s.discard = [];
  s.phase = "playing";
  s.round++;
  s.dir = 1;
  s.pending = null; s.awaiting = null; s.winner = null;
  s.current = rnd(n);
  s.turnsLeft = 1; s.attacked = false;
  log(s, `Runde ${s.round} startet! ${bombs} Bombenkatze${bombs > 1 ? "n" : ""} + 1 Implodierende Katze im Stapel.`, "big");
  log(s, `${cur(s).name} beginnt.`);
}

export function backToLobby(s, byPid) {
  if (byPid !== s.hostId) fail("Nur der Gastgeber kann das.");
  s.phase = "lobby";
  s.pending = null; s.awaiting = null; s.winner = null;
  s.deck = []; s.discard = [];
  for (const p of s.players) { p.hand = []; p.alive = true; p.skipTurns = 0; p.peek = null; }
  log(s, "Zurück in der Lobby.");
}

// ---------------------------------------------------------------- Zugablauf

function checkWin(s) {
  if (s.phase !== "playing") return true;
  if (aliveCount(s) <= 1) {
    const w = s.players.find((p) => p.alive);
    s.phase = "over";
    s.winner = w?.id ?? null;
    s.pending = null; s.awaiting = null;
    log(s, w ? `🏆 ${w.name} gewinnt!` : "Niemand hat überlebt.", "win");
    return true;
  }
  return false;
}

function eliminate(s, p, text) {
  p.alive = false;
  for (const c of p.hand) toDiscard(s, c);
  p.hand = []; p.peek = null; p.skipTurns = 0;
  log(s, text, "boom");
  checkWin(s);
}

// Cappuccino-Zähler am Ende eines eigenen Zuges herunterzählen
function tickCappuccino(s, p) {
  for (const c of [...p.hand]) {
    if (c.t !== "cappuccino" || !p.alive) continue;
    if (c.fresh) { delete c.fresh; continue; }
    c.cap = (c.cap ?? RULES.CAPPUCCINO_TURNS) - 1;
    if (c.cap > 0) continue;
    p.hand.splice(p.hand.indexOf(c), 1);
    toDiscard(s, c);
    const d = p.hand.findIndex((x) => x.t === "defuse");
    if (d >= 0) {
      toDiscard(s, p.hand.splice(d, 1)[0]);
      log(s, `☕💥 ${p.name} hat den Cappuccino zu lange behalten und verliert ein Leben!`, "boom");
    } else {
      eliminate(s, p, `☕💥 ${p.name} hat den Cappuccino zu lange behalten – kein Leben mehr. Raus!`);
    }
  }
}

function startTurn(s) {
  if (checkWin(s)) return;
  const p = cur(s);
  if (p.skipTurns > 0) {
    p.skipTurns--;
    log(s, `☕ ${p.name} setzt diesen Zug aus.`);
    finishTurn(s);
  }
}

function advance(s, idx, turns, attacked) {
  s.current = idx; s.turnsLeft = turns; s.attacked = attacked;
  startTurn(s);
}

// Ein Zug des aktuellen Spielers ist vorbei (gezogen, Skip, Umkehren …)
function finishTurn(s) {
  if (s.phase !== "playing") return;
  const p = cur(s);
  tickCappuccino(s, p);
  p.peek = null;
  if (s.phase !== "playing") return;
  if (!p.alive) return advance(s, nextAliveIndex(s, s.current), 1, false);
  s.turnsLeft--;
  if (s.turnsLeft > 0) {
    log(s, `${p.name} ist nochmal dran (${s.turnsLeft} ${s.turnsLeft === 1 ? "Zug" : "Züge"} übrig).`);
    return startTurn(s);
  }
  advance(s, nextAliveIndex(s, s.current), 1, false);
}

function attackTo(s, idx, n) {
  const p = cur(s);
  const extra = s.attacked ? s.turnsLeft : 0;
  tickCappuccino(s, p);
  p.peek = null;
  if (s.phase !== "playing") return;
  const target = s.players[idx];
  if (!target.alive) idx = nextAliveIndex(s, s.current);
  log(s, `${s.players[idx].name} muss jetzt ${extra + n} Züge machen!`, "attack");
  advance(s, idx, extra + n, true);
}

function handleDraw(s, p, fromBottom) {
  const card = fromBottom ? s.deck.pop() : s.deck.shift();
  if (!card) { log(s, "Der Stapel ist leer."); return finishTurn(s); }
  const where = fromBottom ? " von unten" : "";
  if (card.t === "bomb") {
    const d = p.hand.findIndex((c) => c.t === "defuse");
    if (d >= 0) {
      toDiscard(s, p.hand.splice(d, 1)[0]);
      log(s, `💣 ${p.name} zieht${where} eine Bombenkatze … und entschärft sie mit einem Leben!`, "defused");
      s.awaiting = { kind: "defuse", pid: p.id, card, deadline: now() + RULES.CHOICE_MS };
      return;
    }
    toDiscard(s, card);
    eliminate(s, p, `💥 ${p.name} zieht${where} eine Bombenkatze und explodiert!`);
    if (s.phase === "playing") advance(s, nextAliveIndex(s, s.current), 1, false);
    return;
  }
  if (card.t === "implode") {
    if (card.faceUp) {
      toDiscard(s, card);
      eliminate(s, p, `🌀 ${p.name} zieht die offene Implodierende Katze und implodiert!`);
      if (s.phase === "playing") advance(s, nextAliveIndex(s, s.current), 1, false);
      return;
    }
    card.faceUp = true;
    log(s, `🌀 ${p.name} zieht${where} die Implodierende Katze! Sie wird offen zurückgelegt …`, "defused");
    s.awaiting = { kind: "implode", pid: p.id, card, deadline: now() + RULES.CHOICE_MS };
    return;
  }
  receive(p, card);
  log(s, `${p.name} zieht${where} eine Karte.`);
  log(s, `Du hast gezogen: ${CARDS[card.t].emoji} ${cname(card.t)}`, "private", [p.id]);
  finishTurn(s);
}

function assertTurn(s, pid) {
  if (s.phase !== "playing") fail("Kein Spiel aktiv.");
  if (cur(s).id !== pid) fail("Du bist nicht dran.");
  if (s.pending) fail("Warte, bis die Aktion durch ist.");
  if (s.awaiting) fail("Warte auf eine Entscheidung.");
}

export function draw(s, pid) {
  assertTurn(s, pid);
  handleDraw(s, cur(s), false);
}

function labelFor(cls, types) {
  if (cls.kind === "single") return `${CARDS[cls.card].emoji} ${cname(cls.card)}`;
  if (cls.kind === "pair") return `ein Paar (${types.map((t) => CARDS[t].emoji).join("")})`;
  if (cls.kind === "triple") return `einen Drilling (${types.map((t) => CARDS[t].emoji).join("")})`;
  return `5 verschiedene Karten (${types.map((t) => CARDS[t].emoji).join("")})`;
}

export function playCards(s, pid, { cardIds, target, named } = {}) {
  assertTurn(s, pid);
  const p = cur(s);
  if (!Array.isArray(cardIds) || !cardIds.length || new Set(cardIds).size !== cardIds.length) fail("Ungültige Auswahl.");
  const cards = cardIds.map((id) => p.hand.find((c) => c.id === id));
  if (cards.some((c) => !c)) fail("Diese Karte hast du nicht.");
  const types = cards.map((c) => c.t);
  const cls = classifyPlay(types);
  if (!cls) fail("Diese Kartenkombination geht nicht.");

  let t = null;
  if (cls.target) {
    t = P(s, target);
    if (!t || !t.alive || t.id === pid) fail("Wähle einen anderen Mitspieler.");
    if (cls.needsCards && !t.hand.length) fail(`${t.name} hat keine Karten.`);
  }
  if (cls.named && (!CARDS[named] || named === "bomb" || named === "implode")) fail("Nenne eine Karte.");
  if (cls.kind === "five" && !s.discard.length) fail("Der Ablagestapel ist leer.");

  for (const c of cards) { p.hand.splice(p.hand.indexOf(c), 1); toDiscard(s, c); }
  const label = labelFor(cls, types);
  s.pending = {
    by: pid, kind: cls.kind, card: cls.card ?? null, target: t?.id ?? null, named: cls.named ? named : null,
    types, cardIds, label, nopes: 0, deadline: now() + RULES.NOPE_MS,
  };
  let text = `${p.name} spielt ${label}`;
  if (t) text += ` gegen ${t.name}`;
  if (cls.named) text += ` und will: ${CARDS[named].emoji} ${cname(named)}`;
  log(s, text + ".", "play");
}

export function playNope(s, pid) {
  if (s.phase !== "playing" || !s.pending) fail("Gerade gibt es nichts zu nö-en.");
  const p = P(s, pid);
  if (!p || !p.alive) fail("Du spielst nicht mit.");
  const i = p.hand.findIndex((c) => c.t === "nope");
  if (i < 0) fail("Du hast kein Nö!");
  toDiscard(s, p.hand.splice(i, 1)[0]);
  s.pending.nopes++;
  s.pending.deadline = now() + RULES.NOPE_MS;
  s.pending.lastNoper = pid;
  log(s, `✋ ${p.name}: ${s.pending.nopes % 2 ? "Nö!" : "Nö zum Nö!"}`, "nope");
}

function resolvePending(s) {
  const pd = s.pending;
  s.pending = null;
  if (pd.nopes % 2 === 1) { log(s, `${pd.label} wurde abgewehrt.`); return; }
  const p = P(s, pd.by);
  if (!p || !p.alive || cur(s).id !== p.id) return;
  const t = pd.target ? P(s, pd.target) : null;
  if (pd.target && (!t || !t.alive)) { log(s, "Das Ziel ist nicht mehr im Spiel."); return; }

  switch (pd.kind === "single" ? pd.card : pd.kind) {
    case "slap": return attackTo(s, nextAliveIndex(s, s.current), RULES.SLAP_TURNS);
    case "doubleslap": return attackTo(s, nextAliveIndex(s, s.current), RULES.DOUBLE_SLAP_TURNS);
    case "targeted": return attackTo(s, s.players.indexOf(t), RULES.TARGETED_TURNS);
    case "skip":
      log(s, `${p.name} beendet den Zug ohne zu ziehen.`);
      return finishTurn(s);
    case "reverse":
      s.dir *= -1;
      log(s, `🔄 Die Spielrichtung dreht sich!`);
      return finishTurn(s);
    case "bottom": return handleDraw(s, p, true);
    case "favor":
      if (!t.hand.length) { log(s, `${t.name} hat keine Karten mehr.`); return; }
      s.awaiting = { kind: "favor", pid: t.id, to: p.id, deadline: now() + RULES.CHOICE_MS };
      return;
    case "shuffle":
      shuffle(s.deck);
      for (const x of s.players) x.peek = null;
      log(s, "🔀 Der Stapel wurde gemischt.");
      return;
    case "future":
      p.peek = s.deck.slice(0, 3).map((c) => c.t);
      log(s, `🔮 ${p.name} schaut in die Zukunft.`);
      return;
    case "speer":
      if (!s.deck.length) return handleDraw(s, p, false);
      s.awaiting = { kind: "speer", pid: p.id, count: Math.min(5, s.deck.length), deadline: now() + RULES.CHOICE_MS };
      return;
    case "cappuccino":
      t.skipTurns++;
      log(s, `☕ ${t.name} muss den nächsten Zug aussetzen!`, "attack");
      return;
    case "pair": {
      if (!t.hand.length) { log(s, `${t.name} hat keine Karten mehr.`); return; }
      const c = t.hand.splice(rnd(t.hand.length), 1)[0];
      receive(p, c);
      log(s, `${p.name} klaut ${t.name} eine zufällige Karte.`, "steal");
      log(s, `Geklaut/verloren: ${CARDS[c.t].emoji} ${cname(c.t)}`, "private", [p.id, t.id]);
      return;
    }
    case "triple": {
      const i = t.hand.findIndex((c) => c.t === pd.named);
      if (i < 0) { log(s, `${t.name} hat keine ${cname(pd.named)}. Pech!`); return; }
      const c = t.hand.splice(i, 1)[0];
      receive(p, c);
      log(s, `${p.name} schnappt sich ${CARDS[c.t].emoji} ${cname(c.t)} von ${t.name}!`, "steal");
      return;
    }
    case "five": {
      const options = s.discard.filter((c) => !pd.cardIds.includes(c.id) && c.t !== "bomb" && c.t !== "implode");
      if (!options.length) { log(s, "Im Ablagestapel ist nichts Brauchbares."); return; }
      s.awaiting = { kind: "discard", pid: p.id, exclude: pd.cardIds, deadline: now() + RULES.CHOICE_MS };
      return;
    }
  }
}

// ---------------------------------------------------------------- Entscheidungen

function discardOptions(s, a) {
  return s.discard.filter((c) => !a.exclude.includes(c.id) && c.t !== "bomb" && c.t !== "implode");
}

export function respond(s, pid, payload = {}, auto = false) {
  const a = s.awaiting;
  if (s.phase !== "playing" || !a) fail("Gerade ist keine Entscheidung offen.");
  if (a.pid !== pid) fail("Das entscheidet jemand anderes.");
  const p = P(s, pid);

  if (a.kind === "favor") {
    const to = P(s, a.to);
    let i = p.hand.findIndex((c) => c.id === payload.cardId);
    if (i < 0) { if (!auto) fail("Wähle eine Karte aus deiner Hand."); i = rnd(p.hand.length); }
    s.awaiting = null;
    if (!p.hand.length || !to?.alive) return;
    const c = p.hand.splice(i, 1)[0];
    receive(to, c);
    log(s, `🎁 ${p.name} gibt ${to.name} eine Karte${auto ? " (automatisch)" : ""}.`);
    log(s, `Gefallen: ${CARDS[c.t].emoji} ${cname(c.t)}`, "private", [p.id, to.id]);
    return;
  }

  if (a.kind === "defuse" || a.kind === "implode") {
    let pos = Number(payload.position);
    if (payload.position === "random" || !Number.isInteger(pos) || pos < 0 || pos > s.deck.length) {
      if (payload.position !== "random" && !auto) fail("Ungültige Position.");
      pos = rnd(s.deck.length + 1);
    }
    s.deck.splice(pos, 0, a.card);
    s.awaiting = null;
    log(s, a.kind === "defuse"
      ? `${p.name} legt die Bombenkatze geheim zurück in den Stapel.`
      : `${p.name} legt die Implodierende Katze offen zurück in den Stapel.`);
    return finishTurn(s);
  }

  if (a.kind === "speer") {
    const k = a.count;
    let order = payload.order;
    const valid = Array.isArray(order) && order.length === k &&
      [...order].sort((x, y) => x - y).every((v, i) => v === i);
    if (!valid) { if (!auto) fail("Ungültige Reihenfolge."); order = [...Array(k).keys()]; }
    const top = s.deck.splice(0, k);
    s.deck.unshift(...order.map((i) => top[i]));
    s.awaiting = null;
    log(s, `🗡️ ${p.name} hat die oberen ${k} Karten neu sortiert und zieht jetzt.`);
    return handleDraw(s, p, false);
  }

  if (a.kind === "discard") {
    const opts = discardOptions(s, a);
    let c = opts.find((x) => x.id === payload.cardId);
    if (!c) { if (!auto) fail("Wähle eine Karte aus der Ablage."); c = opts[rnd(opts.length)]; }
    s.awaiting = null;
    if (!c) return;
    s.discard.splice(s.discard.indexOf(c), 1);
    receive(p, c);
    log(s, `${p.name} nimmt ${CARDS[c.t].emoji} ${cname(c.t)} aus der Ablage.`, "steal");
  }
}

// ---------------------------------------------------------------- Timer

export function nextDeadline(s) {
  if (s.phase !== "playing") return null;
  return s.pending?.deadline ?? s.awaiting?.deadline ?? null;
}

// Löst alle abgelaufenen Fristen auf. Gibt true zurück, wenn sich etwas geändert hat.
export function tick(s, t = now()) {
  let changed = false;
  for (let guard = 0; guard < 20; guard++) {
    if (s.phase !== "playing") break;
    if (s.pending && s.pending.deadline <= t) { resolvePending(s); changed = true; continue; }
    if (!s.pending && s.awaiting && s.awaiting.deadline <= t) { respond(s, s.awaiting.pid, {}, true); changed = true; continue; }
    break;
  }
  return changed;
}

// ---------------------------------------------------------------- Ansicht pro Spieler

export function viewFor(s, pid, connected = new Set()) {
  const me = P(s, pid);
  const a = s.awaiting;
  let awaiting = null;
  if (a) {
    awaiting = { kind: a.kind, pid: a.pid, to: a.to ?? null, deadline: a.deadline };
    if (a.pid === pid) {
      if (a.kind === "defuse" || a.kind === "implode") awaiting.deckCount = s.deck.length;
      if (a.kind === "speer") awaiting.cards = s.deck.slice(0, a.count).map((c) => c.t);
      if (a.kind === "discard") awaiting.options = discardOptions(s, a).map((c) => ({ id: c.id, t: c.t }));
    }
  }
  const pd = s.pending;
  return {
    code: s.code, phase: s.phase, hostId: s.hostId, you: pid, isPlayer: !!me, round: s.round,
    players: s.players.map((p) => ({
      id: p.id, name: p.name, alive: p.alive, cards: p.hand.length,
      skipTurns: p.skipTurns, online: connected.has(p.id),
    })),
    current: s.phase === "playing" ? cur(s).id : null,
    turnsLeft: s.turnsLeft, dir: s.dir,
    deckCount: s.deck.length,
    bombsLeft: s.deck.filter((c) => c.t === "bomb" || c.t === "implode").length,
    implodeOnTop: !!(s.deck[0] && s.deck[0].t === "implode" && s.deck[0].faceUp),
    discard: s.discard.slice(-40).map((c) => c.t),
    hand: me ? me.hand.map((c) => ({ id: c.id, t: c.t, ...(c.cap != null ? { cap: c.cap } : {}) })) : [],
    peek: me?.peek ?? null,
    pending: pd ? {
      by: pd.by, kind: pd.kind, card: pd.card, target: pd.target, named: pd.named,
      types: pd.types, label: pd.label, nopes: pd.nopes, deadline: pd.deadline,
    } : null,
    awaiting,
    winner: s.winner,
    log: s.log.filter((l) => !l.to || l.to.includes(pid)).slice(-40),
    now: now(),
  };
}
