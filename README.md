# SSC Percentage Speed Trainer — Calculation Speed Lab

A standalone, offline-first mental-calculation trainer for SSC CGL. It runs in the browser with plain HTML, CSS, and JavaScript—no framework, build step, backend, API, account, or external data service required.

## Run it

Open `index.html` in a modern browser, or serve this folder with any static file host. For example:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. The same three app files can be deployed directly to GitHub Pages, Vercel, or another static host.

## Training modes

- **Normal** — 20 questions with a 3–4 minute sectional timer. Pick one of five sections or use mixed practice.
- **Hard** — the same sectional format with less-obvious values and a 2:30 timer.
- **Extreme** — 100 mixed questions in 15 minutes.
- **God mode** — 100 primarily rapid-recognition questions in 5 minutes.
- **Full workout** — four 20-question sections (percentage → fraction, fraction → percentage, percentage of a number, reverse percentage), each with its own clock, followed by a complete report.

A test creates a new set from exact rational values, number multipliers, and randomized variants. Generation rejects duplicate prompts in a test, avoids recently seen prompts where possible, and independently recomputes each answer before it is shown. Repeating percentages are labelled as approximations; the stored fraction remains exact. Equivalent fraction input is normalized mathematically, and repeating percentage answers accept sensible rounding.

## Personal data and recovery

Test summaries, personal bests, daily dashboard metrics, and recent question history are stored in this browser's `localStorage`. An active test (including a typed draft) is saved as it progresses. After a refresh, resume it from the dashboard. Choosing **Save & exit** pauses the clock; resuming shifts the deadline so the paused time is not charged. Data is local to the browser and is not transmitted anywhere.

Use the **Fraction atlas** for the high-frequency exact fraction values and their clearly marked repeating-decimal approximations.

## Project files

- `index.html` — accessible app structure and views.
- `style.css` — responsive dark interface, live timer states, and reduced-motion support.
- `script.js` — question generation, independent answer validation, timing, result analytics, and local persistence.

The configurable training targets live near the top of `script.js` in `TARGETS`. The `window.SSCSpeedLab` helper exposes generators, validation, answer checking, and target values for browser-console QA.

## Compatibility

Designed for current desktop and mobile browsers. A secure context is not required for normal use; cryptographic randomness is used where supported and falls back to `Math.random()` otherwise. Storage failures do not prevent a test from running in memory.
