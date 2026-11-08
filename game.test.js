import { test } from "node:test";
import assert from "node:assert/strict";
import * as G from "./game.js";
import { classifyPlay, CARDS } from "./cards.js";

const total = (s) => s.deck.length + s.discard.length + s.players.reduce((a, p) => a + p.hand.length, 0)
  + (s.awaiting?.card ? 1 : 0);

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

// Zufällige Bots spielen komplette Partien
function simulate(n) {
  const s = G.createRoom("TEST");
  for (let i = 0; i < n; i++) G.addPlayer(s, "player" + i + "xxxxx", "P" + i);
  G.startGame(s, s.hostId);
  const cards0 = total(s);
  let t = Date.now();
  for (let step = 0; step < 5000 && s.phase === "playing"; step++) {
    t += 100;
    if (s.pending) {
      const nopers = s.players.filter((p) => p.alive && p.hand.some((c) => c.t === "nope"));
      if (nopers.length && Math.random() < 0.3) G.playNope(s, pick(nopers).id);
      else G.tick(s, s.pending.deadline);
    } else if (s.awaiting) {
      const a = s.awaiting;
      if (Math.random() < 0.2) G.tick(s, a.deadline);
      else if (a.kind === "favor") G.respond(s, a.pid, { cardId: pick(s.players.find(p=>p.id===a.pid).hand).id });
      else if (a.kind === "defuse" || a.kind === "implode") G.respond(s, a.pid, { position: Math.floor(Math.random() * (s.deck.length + 1)) });
      else if (a.kind === "speer") G.respond(s, a.pid, { order: [...Array(a.count).keys()].reverse() });
      else G.respond(s, a.pid, {}, true);
    } else {
      const p = s.players[s.current];
      const others = s.players.filter((x) => x.alive && x.id !== p.id);
      // versuche eine zufällige Aktion
      if (Math.random() < 0.55 && p.hand.length) {
        const size = pick([1, 1, 1, 2, 3, 5]);
        const ids = [...p.hand].sort(() => Math.random() - 0.5).slice(0, size).map((c) => c.id);
        const types = ids.map((id) => p.hand.find((c) => c.id === id).t);
        const cls = classifyPlay(types);
        if (cls) {
          const tg = pick(others.filter((o) => !cls.needsCards || o.hand.length));
          try {
            G.playCards(s, p.id, { cardIds: ids, target: tg?.id, named: pick(Object.keys(CARDS).filter(k=>k!=="bomb"&&k!=="implode")) });
          } catch (e) { if (!(e instanceof G.GameError)) throw e; }
          continue;
        }
      }
      G.draw(s, p.id);
    }
    assert.equal(total(s), cards0, "Karten dürfen nicht verschwinden");
    assert.ok(s.players[s.current].alive || s.phase !== "playing", "aktueller Spieler muss leben");
  }
  return s;
}

test("viele Zufallspartien laufen sauber durch", () => {
  let finished = 0;
  for (let i = 0; i < 400; i++) {
    const s = simulate(2 + (i % 7));
    if (s.phase === "over") { finished++; assert.ok(s.winner); }
  }
  assert.ok(finished > 380, `nur ${finished} Partien beendet`);
});

test("Kombinationen", () => {
  assert.equal(classifyPlay(["cat_sock", "cat_sock"]).kind, "pair");
  assert.equal(classifyPlay(["cat_sock", "feral"]).kind, "pair");
  assert.equal(classifyPlay(["cat_sock", "cat_pizza"]), null);
  assert.equal(classifyPlay(["feral", "feral", "cat_beard"]).kind, "triple");
  assert.equal(classifyPlay(["skip", "skip"]).kind, "pair");
  assert.equal(classifyPlay(["skip", "nope", "slap", "cat_sock", "feral"]).kind, "five");
  assert.equal(classifyPlay(["cat_sock"]), null);
  assert.equal(classifyPlay(["nope"]), null);
});

test("Slap stapelt sich", () => {
  const s = G.createRoom("T");
  for (let i = 0; i < 3; i++) G.addPlayer(s, "player" + i + "xxxxx", "P" + i);
  G.startGame(s, s.hostId);
  s.current = 0;
  const give = (i, t) => { const c = { id: 9000 + Math.floor(Math.random()*1e6), t }; s.players[i].hand.push(c); return c.id; };
  G.playCards(s, s.players[0].id, { cardIds: [give(0, "slap")] });
  G.tick(s, Date.now() + 10000);
  assert.equal(s.current, 1); assert.equal(s.turnsLeft, 2);
  G.playCards(s, s.players[1].id, { cardIds: [give(1, "doubleslap")] });
  G.tick(s, Date.now() + 10000);
  assert.equal(s.current, 2); assert.equal(s.turnsLeft, 6);
});

test("Cappuccino-Zähler kostet ein Leben", () => {
  const s = G.createRoom("T");
  for (let i = 0; i < 2; i++) G.addPlayer(s, "player" + i + "xxxxx", "P" + i);
  G.startGame(s, s.hostId);
  s.current = 0;
  const p = s.players[0];
  p.hand = [{ id: 1, t: "defuse" }, { id: 2, t: "cappuccino", cap: 3, fresh: true }];
  s.players[1].hand = [];
  s.deck = Array.from({ length: 20 }, (_, i) => ({ id: 100 + i, t: "cat_sock" }));
  // Zug 0 (Karte frisch gezogen) + 3 weitere eigene Züge
  for (let r = 0; r < 4; r++) { G.draw(s, s.players[s.current].id); G.draw(s, s.players[s.current].id); }
  assert.ok(!p.hand.some((c) => c.t === "cappuccino"));
  assert.ok(!p.hand.some((c) => c.t === "defuse"));
  assert.ok(p.alive);
});

test("Cappuccino lässt Ziel aussetzen", () => {
  const s = G.createRoom("T");
  for (let i = 0; i < 3; i++) G.addPlayer(s, "player" + i + "xxxxx", "P" + i);
  G.startGame(s, s.hostId);
  s.current = 0;
  s.deck = Array.from({ length: 20 }, (_, i) => ({ id: 100 + i, t: "cat_sock" }));
  s.players[0].hand.push({ id: 99999, t: "cappuccino", cap: 3 });
  G.playCards(s, s.players[0].id, { cardIds: [99999], target: s.players[1].id });
  G.tick(s, Date.now() + 10000);
  G.draw(s, s.players[0].id);
  assert.equal(s.current, 2, "Spieler 1 wird übersprungen");
});
