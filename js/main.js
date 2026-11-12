/* WheelDecide main — DOM wiring for the spin-the-wheel decision maker.
 *
 * The wheel maths and storage live in engine.js; this file only translates
 * state into the page, draws the canvas wheel, and runs the spin
 * animation. The spin is decided up front by engine.spinPlan() — the
 * animation only moves the wheel to the precomputed final angle.
 */
import {
  MAX_ENTRIES,
  MAX_HISTORY,
  CURRENT_KEY,
  addEntry,
  editEntry,
  removeEntry,
  shuffleEntries,
  recolorEntries,
  validateEntries,
  entriesToLabels,
  entriesFromPreset,
  presetById,
  winnerIndexForRotation,
  spinPlan,
  easeOutCubic,
  addHistory,
  formatHistoryTime,
  loadCurrent,
  saveCurrent,
  loadLists,
  saveList,
  deleteList,
  loadHistory,
  saveHistory,
  clearHistoryStorage,
  loadSettings,
  saveSettings,
} from "./engine.js";

const $ = (id) => document.getElementById(id);

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

const safeStorage = storage || {
  getItem: () => null,
  setItem: () => { throw new Error("storage unavailable"); },
  removeItem: () => {},
};

const raf = (cb) => {
  if (typeof window.requestAnimationFrame === "function") return window.requestAnimationFrame(cb);
  return setTimeout(() => cb(performance.now()), 16);
};
const cancelRaf = (id) => {
  if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(id);
  else clearTimeout(id);
};

/* --- State ------------------------------------------------------------- */
let entries = loadCurrent(safeStorage);
if (entries === null) {
  // First visit: start with a usable wheel instead of an empty one.
  entries = entriesFromPreset("eat");
  saveCurrent(safeStorage, entries);
}
let history = loadHistory(safeStorage);
let lists = loadLists(safeStorage);
let settings = loadSettings(safeStorage);
let pickedIds = [];
let rotation = 0;
let spinning = false;
let animId = null;
let anim = null;
let lastWinner = null;

/* --- Canvas wheel ------------------------------------------------------ */
function drawWheel() {
  const canvas = $("wheel-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return; // canvas unavailable (e.g. headless test env) — page still works
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 14;
  ctx.clearRect(0, 0, size, size);

  if (entries.length === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#23232E";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#9A9AA5";
    ctx.font = "600 22px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Add entries to build your wheel", cx, cy);
    return;
  }

  const segment = (Math.PI * 2) / entries.length;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotation * Math.PI) / 180);
  for (let i = 0; i < entries.length; i += 1) {
    const start = i * segment;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, start, start + segment);
    ctx.closePath();
    ctx.fillStyle = entries[i].color;
    ctx.fill();
    ctx.strokeStyle = "#0B0B0F";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label along the segment, reading outward from the hub.
    ctx.save();
    ctx.rotate(start + segment / 2);
    ctx.fillStyle = "#0B0B0F";
    ctx.font = "700 21px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const label = entries[i].label.length > 14
      ? `${entries[i].label.slice(0, 13)}…`
      : entries[i].label;
    ctx.fillText(label, radius * 0.28, 0);
    ctx.restore();
  }
  ctx.restore();

  // Hub.
  ctx.beginPath();
  ctx.arc(cx, cy, 46, 0, Math.PI * 2);
  ctx.fillStyle = "#121218";
  ctx.fill();
  ctx.strokeStyle = "#E5484D";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#F5F5F7";
  ctx.font = "700 15px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SPIN", cx, cy);
}

/* --- Confetti ---------------------------------------------------------- */
function burstConfetti() {
  const canvas = $("confetti-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const colors = ["#E5484D", "#FFB224", "#46A758", "#0090FF", "#E93D82", "#F5F5F7"];
  const particles = Array.from({ length: 120 }, () => ({
    x: canvas.width / 2 + (Math.random() - 0.5) * 120,
    y: canvas.height / 2,
    vx: (Math.random() - 0.5) * 9,
    vy: -Math.random() * 9 - 3,
    size: 4 + Math.random() * 6,
    color: colors[Math.floor(Math.random() * colors.length)],
    spin: (Math.random() - 0.5) * 0.3,
    angle: Math.random() * Math.PI,
  }));
  const started = performance.now();
  const step = (now) => {
    const elapsed = now - started;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (elapsed > 2600) return;
    for (const p of particles) {
      p.vy += 0.22;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    raf(step);
  };
  raf(step);
}

/* --- Rendering --------------------------------------------------------- */
function showMessage(text) {
  $("status-message").textContent = text || "";
}

function renderEntries() {
  const list = $("entries-list");
  list.textContent = "";
  for (const entry of entries) {
    const li = document.createElement("li");
    li.className = "entry-row";
    li.dataset.id = entry.id;

    const dot = document.createElement("span");
    dot.className = "entry-dot";
    dot.style.backgroundColor = entry.color;
    li.appendChild(dot);

    const label = document.createElement("span");
    label.className = "entry-label";
    label.textContent = entry.label;
    label.title = "Click to edit";
    label.addEventListener("click", () => startInlineEdit(li, entry));
    li.appendChild(label);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-small btn-ghost entry-delete";
    del.textContent = "Remove";
    del.setAttribute("aria-label", `Remove ${entry.label}`);
    del.addEventListener("click", () => {
      entries = removeEntry(entries, entry.id);
      pickedIds = pickedIds.filter((id) => id !== entry.id);
      persistEntries();
      renderAll();
    });
    li.appendChild(del);
    list.appendChild(li);
  }
  $("entries-empty").hidden = entries.length !== 0;
  $("entry-count").textContent = String(entries.length);
  const canSpin = entries.length >= 2 && !spinning;
  $("spin-btn").disabled = !canSpin;
  $("wheel-empty").hidden = entries.length !== 0;
  // Do not clobber the winner announcement: once a winner is showing,
  // the status line belongs to it until the banner is dismissed.
  if (!lastWinner) {
    $("spin-status").textContent = spinning
      ? "Spinning…"
      : entries.length === 0
        ? "Add your options and spin the wheel."
        : entries.length === 1
          ? "One more entry and you can spin."
          : `${entries.length} options on the wheel. Ready when you are.`;
  }
}

function renderSavedLists() {
  const list = $("saved-lists");
  list.textContent = "";
  const names = Object.keys(lists).sort((a, b) => a.localeCompare(b));
  for (const name of names) {
    const li = document.createElement("li");
    li.className = "saved-row";
    const label = document.createElement("span");
    label.className = "saved-name";
    label.textContent = `${name} (${lists[name].length})`;
    li.appendChild(label);
    const load = document.createElement("button");
    load.type = "button";
    load.className = "btn btn-small";
    load.textContent = "Load";
    load.addEventListener("click", () => loadNamedList(name));
    li.appendChild(load);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-small btn-ghost";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      lists = deleteList(safeStorage, name);
      renderSavedLists();
    });
    li.appendChild(del);
    list.appendChild(li);
  }
  $("saved-lists-empty").hidden = names.length !== 0;
}

function renderHistory() {
  const list = $("history-list");
  list.textContent = "";
  for (const item of history) {
    const li = document.createElement("li");
    li.className = "history-row";
    const label = document.createElement("span");
    label.className = "history-label";
    label.textContent = item.label;
    li.appendChild(label);
    const time = document.createElement("span");
    time.className = "history-time";
    time.textContent = formatHistoryTime(item.time);
    li.appendChild(time);
    list.appendChild(li);
  }
  $("history-empty").hidden = history.length !== 0;
  $("clear-history-btn").disabled = history.length === 0;
}

function renderAll() {
  renderEntries();
  renderSavedLists();
  renderHistory();
  drawWheel();
}

function persistEntries() {
  saveCurrent(safeStorage, entries);
}

/* --- Inline edit ------------------------------------------------------- */
function startInlineEdit(li, entry) {
  const label = li.querySelector(".entry-label");
  if (!label) return;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "entry-edit-input";
  input.value = entry.label;
  input.maxLength = 60;
  input.setAttribute("aria-label", "Edit entry");
  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    const result = editEntry(entries, entry.id, input.value);
    if (result.error) {
      showMessage(result.error);
      renderEntries();
      return;
    }
    entries = result.entries;
    showMessage("");
    persistEntries();
    renderAll();
  };
  const cancel = () => {
    if (done) return;
    done = true;
    renderEntries();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") cancel();
  });
  input.addEventListener("blur", commit);
  label.replaceWith(input);
  input.focus();
  input.select();
}

/* --- Add / shuffle / clear --------------------------------------------- */
function addEntryFromInput() {
  const input = $("entry-input");
  const result = addEntry(entries, input.value);
  if (result.error) {
    showMessage(result.error);
    return false;
  }
  entries = result.entries;
  input.value = "";
  showMessage("");
  persistEntries();
  renderAll();
  input.focus();
  return true;
}

/* --- Confirm modal -----------------------------------------------------
   In-page replacement for window.confirm(): native dialogs are
   auto-dismissed (answer: no) by some browsers and by automation, which
   silently cancels the guarded action. This modal works everywhere. */
let confirmOpen = false;
function askConfirm(message, okLabel) {
  if (confirmOpen) return Promise.resolve(false);
  confirmOpen = true;
  const modal = $("confirm-modal");
  $("confirm-message").textContent = message;
  $("confirm-ok-btn").textContent = okLabel || "Yes";
  modal.hidden = false;
  $("confirm-ok-btn").focus();
  return new Promise((resolve) => {
    const done = (answer) => {
      modal.hidden = true;
      confirmOpen = false;
      document.removeEventListener("keydown", onKey, true);
      resolve(answer);
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); done(false); }
    };
    document.addEventListener("keydown", onKey, true);
    $("confirm-ok-btn").addEventListener("click", () => done(true), { once: true });
    $("confirm-cancel-btn").addEventListener("click", () => done(false), { once: true });
  });
}

async function loadPreset(presetId) {
  const preset = presetById(presetId);
  if (!preset) return false;
  if (entries.length > 0) {
    const ok = await askConfirm(`Replace your current entries with the "${preset.name}" starter list?`, "Yes, replace");
    if (!ok) return false;
  }
  entries = entriesFromPreset(presetId);
  pickedIds = [];
  hideWinner();
  showMessage(`Loaded the "${preset.name}" starter list.`);
  persistEntries();
  renderAll();
  return true;
}

async function loadNamedList(name) {
  const labels = lists[name];
  if (!labels) return false;
  if (entries.length > 0) {
    const ok = await askConfirm(`Replace your current entries with the saved list "${name}"?`, "Yes, replace");
    if (!ok) return false;
  }
  entries = validateEntries(labels);
  pickedIds = [];
  hideWinner();
  showMessage(`Loaded the saved list "${name}".`);
  persistEntries();
  renderAll();
  return true;
}

async function saveNamedList() {
  const input = $("save-list-name");
  const name = input.value.trim();
  if (!name) {
    showMessage("Give the list a name first.");
    return false;
  }
  const existing = loadLists(safeStorage);
  if (Object.prototype.hasOwnProperty.call(existing, name)) {
    const ok = await askConfirm(`A list called "${name}" already exists. Overwrite it?`, "Yes, overwrite");
    if (!ok) return false;
  }
  const result = saveList(safeStorage, name, entries);
  if (result.error) {
    showMessage(result.error);
    return false;
  }
  lists = result.lists;
  input.value = "";
  showMessage(`Saved as "${name}".`);
  renderSavedLists();
  return true;
}

async function clearAll() {
  if (entries.length === 0) return false;
  const ok = await askConfirm("Remove every entry from the wheel?", "Yes, clear all");
  if (!ok) return false;
  entries = [];
  pickedIds = [];
  hideWinner();
  showMessage("");
  persistEntries();
  renderAll();
  return true;
}

/* --- Spin -------------------------------------------------------------- */
function hideWinner() {
  $("winner-banner").hidden = true;
  $("winner-name").textContent = "";
  $("spin-again-btn").hidden = true;
  lastWinner = null;
}

function showWinner(winner) {
  lastWinner = winner;
  $("winner-name").textContent = winner.label;
  $("winner-banner").hidden = false;
  $("spin-again-btn").hidden = false;
  $("spin-status").textContent = `The wheel picked ${winner.label}.`;
  burstConfetti();
}

function finalizeSpin() {
  const plan = anim ? anim.plan : null;
  spinning = false;
  anim = null;
  if (animId !== null) {
    cancelRaf(animId);
    animId = null;
  }
  // Recompute from the final angle as a sanity check — the two must agree.
  const byAngle = winnerIndexForRotation(entries.length, rotation);
  const winnerIndex = plan && byAngle === plan.winnerIndex ? plan.winnerIndex : byAngle;
  const winner = entries[winnerIndex];
  if (!winner) {
    renderAll();
    return;
  }
  history = addHistory(history, winner.label);
  saveHistory(safeStorage, history);

  if (settings.noRepeat) {
    pickedIds.push(winner.id);
    if (pickedIds.length >= entries.length) {
      pickedIds = [];
      showMessage("Everyone has been picked once — the wheel starts fresh next spin.");
    }
  }

  showWinner(winner);
  renderAll();

  if (settings.removeWinner) {
    entries = removeEntry(entries, winner.id);
    pickedIds = pickedIds.filter((id) => id !== winner.id);
    persistEntries();
    renderAll();
    $("spin-status").textContent = `${winner.label} won and was removed from the wheel.`;
  }
}

function startSpin(options = {}) {
  if (spinning || entries.length < 2) return false;
  const random = options.random || Math.random;
  const excludeIds = settings.noRepeat ? pickedIds : [];
  const plan = spinPlan(entries.length, rotation, { random, entries, excludeIds });
  if (!plan) return false;
  hideWinner();
  spinning = true;
  renderEntries();
  const duration = typeof options.durationMs === "number" ? options.durationMs : plan.durationMs;
  anim = { plan, from: rotation, to: plan.targetRotation, start: performance.now(), duration };
  const step = (now) => {
    if (!anim) return;
    const t = Math.min(1, (now - anim.start) / anim.duration);
    rotation = anim.from + (anim.to - anim.from) * easeOutCubic(t);
    drawWheel();
    if (t < 1) {
      animId = raf(step);
    } else {
      rotation = anim.to;
      drawWheel();
      finalizeSpin();
    }
  };
  animId = raf(step);
  return true;
}

function finishSpinNow() {
  if (!anim) return false;
  rotation = anim.plan.targetRotation;
  drawWheel();
  finalizeSpin();
  return true;
}

function removeWinnerNow() {
  if (!lastWinner) return false;
  const label = lastWinner.label;
  entries = removeEntry(entries, lastWinner.id);
  pickedIds = pickedIds.filter((id) => id !== lastWinner.id);
  hideWinner();
  persistEntries();
  renderAll();
  showMessage(`"${label}" removed from the wheel.`);
  return true;
}

function copyWinner() {
  if (!lastWinner) return false;
  const text = `WheelDecide picked: ${lastWinner.label}`;
  const done = () => showMessage("Copied — share it wherever you like.");
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
  return true;
}

function fallbackCopy(text, done) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    done();
  } catch {
    showMessage("Copy did not work in this browser — the winner is shown above.");
  }
}

/* --- History ----------------------------------------------------------- */
function clearHistory() {
  if (history.length === 0) return false;
  history = [];
  clearHistoryStorage(safeStorage);
  renderHistory();
  return true;
}

/* --- Wiring ------------------------------------------------------------ */
$("add-entry-btn").addEventListener("click", addEntryFromInput);
$("entry-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addEntryFromInput();
});
$("shuffle-btn").addEventListener("click", () => {
  if (entries.length < 2) {
    showMessage("Add at least two entries to shuffle.");
    return;
  }
  entries = recolorEntries(shuffleEntries(entries));
  pickedIds = [];
  persistEntries();
  renderAll();
  showMessage("Entries shuffled.");
});
$("clear-all-btn").addEventListener("click", clearAll);
$("spin-btn").addEventListener("click", () => startSpin());
$("spin-again-btn").addEventListener("click", () => startSpin());
$("winner-copy-btn").addEventListener("click", copyWinner);
$("winner-remove-btn").addEventListener("click", removeWinnerNow);
$("winner-dismiss-btn").addEventListener("click", () => { hideWinner(); renderAll(); });
$("save-list-btn").addEventListener("click", saveNamedList);
$("save-list-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveNamedList();
});
$("clear-history-btn").addEventListener("click", clearHistory);
$("remove-winner-toggle").addEventListener("change", (e) => {
  settings.removeWinner = e.target.checked;
  saveSettings(safeStorage, settings);
});
$("no-repeat-toggle").addEventListener("change", (e) => {
  settings.noRepeat = e.target.checked;
  if (!settings.noRepeat) pickedIds = [];
  saveSettings(safeStorage, settings);
});
document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => loadPreset(btn.dataset.preset));
});
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space") return;
  const target = e.target;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
  if (target === document.body || target === $("spin-btn") || target === $("spin-again-btn")) {
    e.preventDefault();
    startSpin();
  }
});

// Restore saved toggle states.
$("remove-winner-toggle").checked = settings.removeWinner;
$("no-repeat-toggle").checked = settings.noRepeat;

renderAll();

export {
  getState,
  startSpin,
  finishSpinNow,
  loadPreset,
  loadNamedList,
  saveNamedList,
  clearAll,
  clearHistory,
  addEntryFromInput,
  removeWinnerNow,
  copyWinner,
  hideWinner,
  drawWheel,
  entries,
};

function getState() {
  return {
    entries: entries.map((e) => ({ ...e })),
    history: history.map((h) => ({ ...h })),
    lists: JSON.parse(JSON.stringify(lists)),
    settings: { ...settings },
    pickedIds: [...pickedIds],
    rotation,
    spinning,
    winner: lastWinner ? { ...lastWinner } : null,
  };
}
