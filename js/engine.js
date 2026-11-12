/* WheelDecide engine — pure logic for the spin-the-wheel decision maker.
 *
 * No DOM, no timers, no network here. main.js wires this to the page.
 * The wheel is fair: every entry gets an equal slice and the winner is
 * picked with a uniform random draw. The spin animation is only theatre —
 * the winner is decided up front by spinPlan() and the final angle is
 * computed so that the winner's segment ends up under the pointer.
 */

export const MAX_ENTRIES = 24;
export const MAX_HISTORY = 10;
export const MAX_LIST_NAME = 40;
export const MAX_LABEL_LENGTH = 60;

export const CURRENT_KEY = "wheeldecide.current.v1";
export const LISTS_KEY = "wheeldecide.lists.v1";
export const HISTORY_KEY = "wheeldecide.history.v1";
export const SETTINGS_KEY = "wheeldecide.settings.v1";

export const SITE_URL = "https://wheeldecide-app.vercel.app/";

/* Ten colours that stay readable on the dark wheel and differ clearly
 * from their neighbours. Entries cycle through them in order, so the
 * first entries always look the same and repeats are never adjacent. */
export const PALETTE = [
  "#E5484D",
  "#F76B15",
  "#FFB224",
  "#46A758",
  "#3DD68C",
  "#0090FF",
  "#8E4EC6",
  "#E93D82",
  "#12A594",
  "#FF7A90",
];

export const PRESETS = [
  {
    id: "eat",
    name: "What to eat?",
    entries: ["Pizza", "Burgers", "Sushi", "Pasta", "Tacos", "Biryani"],
  },
  {
    id: "movie",
    name: "Movie night",
    entries: ["Action", "Comedy", "Horror", "Sci-Fi", "Romance", "Documentary"],
  },
  {
    id: "first",
    name: "Who goes first?",
    entries: ["Alex", "Priya", "Sam", "Jordan"],
  },
  {
    id: "yesno",
    name: "Yes or no?",
    entries: ["Yes", "No", "Maybe", "Definitely", "Ask again later"],
  },
];

export function colorForIndex(index) {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

export function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `e-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function normalizeLabel(label) {
  return typeof label === "string" ? label.trim().slice(0, MAX_LABEL_LENGTH) : "";
}

function hasLabel(entries, label, exceptId = null) {
  const needle = label.toLowerCase();
  return entries.some(
    (e) => e.id !== exceptId && e.label.toLowerCase() === needle,
  );
}

/* Add one entry. Returns { entries, entry } on success or
 * { entries, error } with a human-readable reason on failure. The input
 * array is never mutated — callers always take the returned array. */
export function addEntry(entries, label) {
  const clean = normalizeLabel(label);
  if (!clean) return { entries, error: "Type something first — an empty entry cannot go on the wheel." };
  if (hasLabel(entries, clean)) {
    return { entries, error: `"${clean}" is already on the wheel.` };
  }
  if (entries.length >= MAX_ENTRIES) {
    return { entries, error: `The wheel holds ${MAX_ENTRIES} entries at most. Remove one before adding another.` };
  }
  const entry = { id: createId(), label: clean, color: colorForIndex(entries.length) };
  return { entries: [...entries, entry], entry };
}

export function editEntry(entries, id, label) {
  const clean = normalizeLabel(label);
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1) return { entries, error: "That entry is no longer on the wheel." };
  if (!clean) return { entries, error: "An entry cannot be blank." };
  if (hasLabel(entries, clean, id)) {
    return { entries, error: `"${clean}" is already on the wheel.` };
  }
  const next = entries.slice();
  next[index] = { ...next[index], label: clean };
  return { entries: next };
}

export function removeEntry(entries, id) {
  return entries.filter((e) => e.id !== id);
}

export function clearEntries() {
  return [];
}

/* Fisher–Yates with an injectable random source, so tests can seed it. */
export function shuffleEntries(entries, random = Math.random) {
  const next = entries.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/* Re-colour entries by position after a load or a shuffle, so the wheel
 * always shows the palette in order. */
export function recolorEntries(entries) {
  return entries.map((e, i) => ({ ...e, color: colorForIndex(i) }));
}

/* Validate stored data: junk is dropped, not trusted. Accepts an array of
 * strings or of { label } objects; anything else is ignored. */
export function validateEntries(raw) {
  if (!Array.isArray(raw)) return [];
  const labels = [];
  for (const item of raw) {
    const label = typeof item === "string" ? item : item && typeof item === "object" ? item.label : null;
    const clean = normalizeLabel(label);
    if (clean && !labels.some((l) => l.toLowerCase() === clean.toLowerCase())) {
      labels.push(clean);
    }
    if (labels.length >= MAX_ENTRIES) break;
  }
  return labels.map((label, i) => ({ id: createId(), label, color: colorForIndex(i) }));
}

export function entriesToLabels(entries) {
  return entries.map((e) => e.label);
}

export function presetById(id) {
  return PRESETS.find((p) => p.id === id) || null;
}

export function entriesFromPreset(presetId) {
  const preset = presetById(presetId);
  if (!preset) return [];
  return preset.entries.map((label, i) => ({ id: createId(), label, color: colorForIndex(i) }));
}

/* --- Spin maths ------------------------------------------------------- */
/* The pointer sits at the top of the wheel (270 degrees in canvas terms,
 * where 0 degrees points right and angles grow clockwise). A wheel
 * rotation of `rotation` degrees puts the segment whose wheel-local angle
 * is (270 - rotation) under the pointer. */
export function winnerIndexForRotation(count, rotation) {
  if (count < 1) return -1;
  const segment = 360 / count;
  const pointerAngle = (((270 - rotation) % 360) + 360) % 360;
  return Math.min(count - 1, Math.floor(pointerAngle / segment));
}

/* Pick a winner index, optionally skipping ids already picked this round
 * (the "don't repeat until all picked" mode). Returns -1 when there is
 * nothing left to pick from. */
export function pickWinnerIndex(count, { random = Math.random, excludeIds = [], entries = null } = {}) {
  if (count < 1) return -1;
  let pool = Array.from({ length: count }, (_, i) => i);
  if (entries && excludeIds.length > 0) {
    const remaining = pool.filter((i) => !excludeIds.includes(entries[i].id));
    if (remaining.length > 0) pool = remaining;
  }
  return pool[Math.floor(random() * pool.length)];
}

/* Decide a spin before the animation starts: which entry wins, how far
 * the wheel turns, and how long it takes. The final rotation is computed
 * so the winner's segment centre lands exactly under the pointer. */
export function spinPlan(count, currentRotation, { random = Math.random, entries = null, excludeIds = [] } = {}) {
  const winnerIndex = pickWinnerIndex(count, { random, excludeIds, entries });
  if (winnerIndex === -1) return null;
  const segment = 360 / count;
  const centre = (winnerIndex + 0.5) * segment;
  const base = 270 - centre;
  const delta = (((base - currentRotation) % 360) + 360) % 360;
  const spins = 5 + Math.floor(random() * 3); // 5–7 full turns
  const targetRotation = currentRotation + spins * 360 + delta;
  const durationMs = 4200 + random() * 1800; // 4.2–6 seconds
  return { winnerIndex, targetRotation, spins, durationMs };
}

export function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/* --- Spin history ------------------------------------------------------ */
export function addHistory(history, label, at = new Date()) {
  const item = { label, time: at instanceof Date ? at.toISOString() : String(at) };
  return [item, ...history].slice(0, MAX_HISTORY);
}

export function formatHistoryTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/* --- Storage helpers --------------------------------------------------- */
/* Every helper tolerates a missing, throwing, or junk-filled store: a
 * broken localStorage must never take the page down with it. */
function safeGet(storage, key) {
  try {
    return storage ? storage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSet(storage, key, value) {
  try {
    if (storage) storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(storage, key) {
  try {
    if (storage) storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function loadCurrent(storage) {
  const raw = safeGet(storage, CURRENT_KEY);
  if (!raw) return null;
  try {
    return validateEntries(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveCurrent(storage, entries) {
  return safeSet(storage, CURRENT_KEY, JSON.stringify(entriesToLabels(entries)));
}

export function loadLists(storage) {
  const raw = safeGet(storage, LISTS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const clean = {};
    for (const [name, value] of Object.entries(parsed)) {
      const labels = entriesToLabels(validateEntries(value));
      if (name && labels.length > 0) clean[name] = labels;
    }
    return clean;
  } catch {
    return {};
  }
}

export function saveList(storage, name, entries) {
  const cleanName = typeof name === "string" ? name.trim().slice(0, MAX_LIST_NAME) : "";
  if (!cleanName) return { lists: loadLists(storage), error: "Give the list a name first." };
  if (entries.length === 0) return { lists: loadLists(storage), error: "Add at least one entry before saving a list." };
  const lists = loadLists(storage);
  const existed = Object.prototype.hasOwnProperty.call(lists, cleanName);
  lists[cleanName] = entriesToLabels(entries);
  const ok = safeSet(storage, LISTS_KEY, JSON.stringify(lists));
  return { lists, existed, ok };
}

export function deleteList(storage, name) {
  const lists = loadLists(storage);
  delete lists[name];
  safeSet(storage, LISTS_KEY, JSON.stringify(lists));
  return lists;
}

export function loadHistory(storage) {
  const raw = safeGet(storage, HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((h) => h && typeof h.label === "string" && typeof h.time === "string")
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

export function saveHistory(storage, history) {
  return safeSet(storage, HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

export function clearHistoryStorage(storage) {
  safeRemove(storage, HISTORY_KEY);
}

export function loadSettings(storage) {
  const defaults = { removeWinner: false, noRepeat: false };
  const raw = safeGet(storage, SETTINGS_KEY);
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaults;
    return {
      removeWinner: parsed.removeWinner === true,
      noRepeat: parsed.noRepeat === true,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(storage, settings) {
  return safeSet(
    storage,
    SETTINGS_KEY,
    JSON.stringify({ removeWinner: !!settings.removeWinner, noRepeat: !!settings.noRepeat }),
  );
}
