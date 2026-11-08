// Kartendefinitionen – werden von Server UND Browser benutzt.
// Name/Texte hier ändern, dann ändert es sich überall.

export const GAME_NAME = "Miau Bumm!";

export const CARDS = {
  bomb:        { name: "Bombenkatze",        emoji: "💣", tone: "bomb",   text: "Wer sie zieht, explodiert – außer er hat einen Entschärfer." },
  implode:     { name: "Implodierende Katze", short: "Implodier-Katze", emoji: "🌀", tone: "bomb",   text: "Beim ersten Ziehen offen zurücklegen. Beim zweiten Mal: raus. Kein Entschärfen möglich." },
  defuse:      { name: "Entschärfer",         emoji: "❤️", tone: "life",   text: "Dein Leben. Rettet dich vor einer Bombenkatze – du legst sie geheim zurück in den Stapel." },
  slap:        { name: "Slap",                emoji: "👋", tone: "attack", text: "Zug beenden ohne zu ziehen. Der Nächste muss 2 Züge machen." },
  doubleslap:  { name: "Double Slap",         emoji: "🙌", tone: "attack", text: "Zug beenden ohne zu ziehen. Der Nächste muss 4 Züge machen." },
  targeted:    { name: "Gezielter Angriff", short: "Gezielter Angriff",   emoji: "🎯", tone: "attack", text: "Zug beenden ohne zu ziehen. Ein Spieler deiner Wahl muss 2 Züge machen." },
  skip:        { name: "Skip",                emoji: "⏭️", tone: "skip",   text: "Beende einen Zug, ohne zu ziehen." },
  reverse:     { name: "Umkehren",            emoji: "🔄", tone: "skip",   text: "Spielrichtung umdrehen und Zug beenden, ohne zu ziehen." },
  bottom:      { name: "Von unten ziehen",    emoji: "⤵️", tone: "skip",   text: "Ziehe die unterste Karte des Stapels statt der obersten." },
  favor:       { name: "Gefallen",            emoji: "🎁", tone: "steal",  text: "Ein Spieler deiner Wahl muss dir eine Karte seiner Wahl geben." },
  shuffle:     { name: "Mischen",             emoji: "🔀", tone: "future", text: "Mische den Stapel." },
  future:      { name: "Blick in die Zukunft", short: "Zukunft", emoji: "🔮", tone: "future", text: "Sieh dir heimlich die oberen 3 Karten an." },
  speer:       { name: "Österreichischer Speer", short: "Österr. Speer", emoji: "🗡️", tone: "future", text: "Nimm die oberen 5 Karten, ordne sie neu – dann ziehst du eine Karte." },
  cappuccino:  { name: "Cappuccino",          emoji: "☕", tone: "special", text: "Lege ihn innerhalb von 3 Zügen ab – sonst verlierst du ein Leben. Gespielt: Ein Spieler deiner Wahl setzt einen Zug komplett aus." },
  nope:        { name: "Nö!",                 emoji: "✋", tone: "nope",   text: "Stoppt jede Aktion (außer Bomben & Entschärfer). Auch ein Nö kann man nö-en." },
  cat_sock:    { name: "Sockenkatze",         emoji: "🧦", tone: "cat",    text: "Katze. 2 gleiche: zufällige Karte klauen. 3 gleiche: Karte benennen und klauen." },
  cat_pizza:   { name: "Pizzakatze",          emoji: "🍕", tone: "cat",    text: "Katze. 2 gleiche: zufällige Karte klauen. 3 gleiche: Karte benennen und klauen." },
  cat_beard:   { name: "Bartkatze",           emoji: "🧔", tone: "cat",    text: "Katze. 2 gleiche: zufällige Karte klauen. 3 gleiche: Karte benennen und klauen." },
  cat_cactus:  { name: "Kaktuskatze",         emoji: "🌵", tone: "cat",    text: "Katze. 2 gleiche: zufällige Karte klauen. 3 gleiche: Karte benennen und klauen." },
  cat_noodle:  { name: "Nudelkatze",          emoji: "🍝", tone: "cat",    text: "Katze. 2 gleiche: zufällige Karte klauen. 3 gleiche: Karte benennen und klauen." },
  feral:       { name: "Wilde Katze",         emoji: "🐯", tone: "cat",    text: "Joker: zählt als jede andere Katze für Paare und Drillinge." },
};

export const CAT_TYPES = ["cat_sock", "cat_pizza", "cat_beard", "cat_cactus", "cat_noodle"];

// Karten, die man einzeln spielen kann (+ ob ein Ziel nötig ist)
export const SINGLE_ACTIONS = {
  slap: { target: false },
  doubleslap: { target: false },
  targeted: { target: true },
  skip: { target: false },
  reverse: { target: false },
  bottom: { target: false },
  favor: { target: true, needsCards: true },
  shuffle: { target: false },
  future: { target: false },
  speer: { target: false },
  cappuccino: { target: true },
};

// Wie viele Exemplare pro Kartensatz (2–5 Spieler). Ab 6 Spielern wird verdoppelt.
export const DECK_COUNTS = {
  slap: 4, doubleslap: 2, targeted: 3, skip: 4, reverse: 3, bottom: 3,
  favor: 3, shuffle: 4, future: 4, speer: 3, cappuccino: 2, nope: 5,
  cat_sock: 4, cat_pizza: 4, cat_beard: 4, cat_cactus: 4, cat_noodle: 4, feral: 4,
};

export const RULES = {
  SLAP_TURNS: 2,
  DOUBLE_SLAP_TURNS: 4,
  TARGETED_TURNS: 2,
  CAPPUCCINO_TURNS: 3,
  HAND_SIZE: 7,
  DEFUSES_PER_SET: 6,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 8,
  NOPE_MS: 5000,
  CHOICE_MS: 45000,
};

const isCat = (t) => CAT_TYPES.includes(t) || t === "feral";

// Erkennt, was eine Auswahl von Kartentypen bewirkt. Gibt null zurück, wenn ungültig.
export function classifyPlay(types) {
  const n = types.length;
  if (n === 1) {
    const t = types[0];
    if (SINGLE_ACTIONS[t]) return { kind: "single", card: t, ...SINGLE_ACTIONS[t] };
    return null;
  }
  if (types.some((t) => t === "bomb" || t === "implode")) return null;
  if (n === 2 || n === 3) {
    let ok;
    if (types.every(isCat)) {
      const real = new Set(types.filter((t) => t !== "feral"));
      ok = real.size <= 1;
    } else {
      ok = types.every((t) => t === types[0]);
    }
    if (!ok) return null;
    return n === 2
      ? { kind: "pair", target: true, needsCards: true }
      : { kind: "triple", target: true, named: true };
  }
  if (n === 5 && new Set(types).size === 5) return { kind: "five", target: false };
  return null;
}
