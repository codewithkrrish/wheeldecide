# WheelDecide — Spin the Wheel to Decide

I built WheelDecide for the oldest argument in my house: what to eat for dinner. Every "decision wheel" I found online was either plastered with ads or wanted an account before it would let me add a single option. This one is a single page: type your options, spin, and the wheel picks one. No account, no ads, nothing uploaded.

## What it does

- **Custom entries** — add options one at a time (or press Enter), each with its own colour. Click any entry to edit it inline, remove entries one by one, or clear the whole wheel with a confirm.
- **A real spin** — the wheel turns five to seven full rotations and slows down over 4–6 seconds before the winner lands under the pointer, with a confetti burst and the winner announced large. The spin button stays disabled while the wheel is turning.
- **Starter lists** — "What to eat?", "Movie night", "Who goes first?" and "Yes or no?" load in one click. The first time you open the page, the "What to eat?" list is already on the wheel so you can spin straight away.
- **Saved lists** — save the current wheel under a name, load it back later, delete it, or overwrite it (with a confirm). Your working list is autosaved, so a refresh restores it exactly as you left it.
- **Fair-play options** — "Remove the winner after each spin" takes the winner off the wheel automatically, and "Don't repeat until everyone has been picked" makes the wheel skip past winners until every entry has had a turn.
- **Spin history** — your last 10 winners with the time they were picked, plus a clear-history button.
- **Small things that matter** — duplicate entries are refused with a clear message instead of silently doubling up, the wheel caps at 24 entries and says so honestly, the winner can be copied with one click, and the whole page works from a keyboard (Enter to add, Space to spin) and on a phone.

## How it works

There is no server. `js/engine.js` holds the pure logic: entry add/edit/delete with the duplicate guard and the 24-entry cap, the spin maths, the presets, and the localStorage helpers (which tolerate a broken or unavailable store instead of crashing the page). `js/main.js` only wires that logic to the page, draws the wheel on a canvas, and runs the spin animation.

The spin is fair by construction, not by promise: every entry gets an equal slice of the wheel, the winner is picked with a uniform random draw, and the final angle is computed so the winner's segment ends up under the pointer. The animation is theatre — the result is decided before the wheel starts moving, and the page re-checks the winner from the final angle as a sanity check.

## Honest limits

- The wheel is random, not rigged, and it is for fun decisions only. It cannot make a good decision for you — it just makes a random one quickly.
- With one entry there is nothing to spin, and with none the wheel shows an empty state and the spin button stays disabled. That is deliberate: a one-option "decision" is not a decision.
- Saved lists live in this browser's local storage. Clearing your browser data, or switching browsers, loses them — there is no account to sync them to, by design.
- Very long entry names are cut to 60 characters when added and shortened on the wheel itself, so the labels stay readable.

## Run it locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. No build step, no dependencies, no install.

## Tech

Vanilla HTML, CSS and JavaScript (ES modules). No frameworks, no analytics, no network calls at all — everything happens on your device.

## License

MIT — see [LICENSE](LICENSE).
