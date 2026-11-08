# Miau Bumm! 💣🐱

Ein explosives Katzen-Kartenspiel für 2–8 Spieler im Browser. Es läuft komplett auf Cloudflare (Workers + Durable Objects) und kostet im Free-Plan nichts.

## So spielt man
1. Seite öffnen, Namen eingeben, **Neues Spiel erstellen**.
2. **Einladungslink teilen** – Freunde öffnen den Link oder geben den Raumcode ein.
3. Gastgeber drückt **Spiel starten**.

Regeln und alle Karten stehen im Spiel unter **Regeln**.

## Online stellen (einmalig, ca. 5 Minuten)
1. Kostenloses Konto auf [dash.cloudflare.com](https://dash.cloudflare.com) anlegen.
2. Links **Compute (Workers) → Workers & Pages → Erstellen**.
3. **Repository importieren** wählen, GitHub verbinden und dieses Repo auswählen.
4. Einstellungen so lassen (Deploy-Befehl: `npx wrangler deploy`) und **Speichern und bereitstellen**.
5. Nach ca. 1 Minute bekommst du eine Adresse wie `https://miau-bumm.<dein-name>.workers.dev`. Fertig!

Ab dann geht jede Änderung, die ins Repo gepusht wird, automatisch online.

## Lokal entwickeln
```bash
npm install
npm run dev     # startet auf http://localhost:8787
npm test        # Regeltests mit simulierten Partien
```

## Aufbau
| Datei | Inhalt |
|---|---|
| `public/cards.js` | Alle Karten, Texte, Anzahl im Deck und Regel-Zahlen – **hier Namen & Balance ändern** |
| `src/game.js` | Die komplette Spiellogik (läuft nur auf dem Server, damit niemand schummeln kann) |
| `src/index.js` | Cloudflare Worker + Durable Object: ein Objekt pro Spielraum, WebSockets, Timer |
| `public/app.js` | Browser-Oberfläche |
| `public/style.css` | Aussehen |

Jeder Spieler bekommt vom Server nur seine eigenen Karten zu sehen.
