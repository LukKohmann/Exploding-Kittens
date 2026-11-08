import { DurableObject } from "cloudflare:workers";
import * as G from "./game.js";

const ROOM_RE = /^[A-Z0-9]{4,8}$/;
const CLEANUP_MS = 24 * 60 * 60 * 1000; // leere Räume nach 24 h löschen

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9]+)$/);
    if (m) {
      const code = m[1].toUpperCase();
      if (!ROOM_RE.test(code)) return new Response("Ungültiger Raumcode", { status: 400 });
      if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket erwartet", { status: 426 });
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// Ein Durable Object = ein Spielraum. Hält den kompletten Spielstand.
export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.state = null;
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get("state")) ?? null;
    });
  }

  async fetch(request) {
    const code = new URL(request.url).pathname.split("/").pop().toUpperCase();
    if (!this.state) this.state = G.createRoom(code);
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ pid: null });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  connectedPids(exclude) {
    const set = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const pid = ws.deserializeAttachment()?.pid;
      if (pid) set.add(pid);
    }
    return set;
  }

  send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  }

  broadcast(exclude) {
    const online = this.connectedPids(exclude);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const pid = ws.deserializeAttachment()?.pid;
      if (pid) this.send(ws, { type: "state", state: G.viewFor(this.state, pid, online) });
    }
  }

  async save() {
    this.state.lastActivity = Date.now();
    await this.ctx.storage.put("state", this.state);
    const dl = G.nextDeadline(this.state);
    await this.ctx.storage.setAlarm(dl ?? Date.now() + CLEANUP_MS);
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > 4000) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const s = this.state;
    const att = ws.deserializeAttachment() || {};

    try {
      if (msg.type === "hello") {
        const pid = String(msg.pid || "").slice(0, 64);
        if (!/^[A-Za-z0-9_-]{8,64}$/.test(pid)) throw new G.GameError("Ungültige Spieler-ID.");
        ws.serializeAttachment({ pid });
        const joined = msg.name ? G.addPlayer(s, pid, msg.name) : !!s.players.find((p) => p.id === pid);
        if (!joined && msg.name) this.send(ws, { type: "error", msg: "Das Spiel läuft schon – du schaust zu." });
      } else {
        const pid = att.pid;
        if (!pid) throw new G.GameError("Bitte erst beitreten.");
        G.tick(s);
        switch (msg.type) {
          case "start": G.startGame(s, pid); break;
          case "leave": G.leave(s, pid); break;
          case "kick": G.kick(s, pid, msg.target); break;
          case "lobby": G.backToLobby(s, pid); break;
          case "play": G.playCards(s, pid, msg); break;
          case "nope": G.playNope(s, pid); break;
          case "draw": G.draw(s, pid); break;
          case "respond": G.respond(s, pid, msg); break;
          case "ping": this.send(ws, { type: "pong", now: Date.now() }); return;
          default: return;
        }
      }
    } catch (e) {
      if (e instanceof G.GameError) this.send(ws, { type: "error", msg: e.message });
      else { console.error(e); this.send(ws, { type: "error", msg: "Interner Fehler." }); }
    }
    await this.save();
    this.broadcast();
  }

  async webSocketClose(ws) {
    try { ws.close(1000); } catch {}
    if (this.state) this.broadcast(ws);
  }

  async webSocketError(ws) {
    if (this.state) this.broadcast(ws);
  }

  async alarm() {
    if (!this.state) return;
    const s = this.state;
    if (G.tick(s)) {
      await this.save();
      this.broadcast();
      return;
    }
    const dl = G.nextDeadline(s);
    if (dl) { await this.ctx.storage.setAlarm(dl); return; }
    if (this.ctx.getWebSockets().length === 0 && Date.now() - s.lastActivity > CLEANUP_MS - 60000) {
      await this.ctx.storage.deleteAll();
      this.state = null;
      return;
    }
    await this.ctx.storage.setAlarm(Date.now() + CLEANUP_MS);
  }
}
