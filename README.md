# Bracket

A small, dependency-free static web app for ranking **any** list of things by repeatedly picking the one you prefer in head-to-head matchups. It's a reusable **starter template**: point it at a set of albums, board games, movies, or whatever else, and it produces a full tiered ranking.

In-progress rankings are saved in browser storage and resume automatically after a reload until you choose **Start Over**.

![Screenshot of the tool with 3 different media types](/bracket-game.png)

## Run It

Open [`index.html`](index.html) in any modern browser. No server, no build step, no dependencies. The bundled example ranks albums.

## How It Works

Instead of a full sort (`~n*log2(n)` comparisons), the app runs a **Swiss-system tournament** — a fixed number of rounds where items with similar records are paired against each other. After the rounds finish, items bucket into **tiers by win count**, with a Buchholz tiebreaker (sum of opponents' wins) ordering items within a tier.

- Fewer rounds → fewer comparisons, coarser tiers. You choose the number of rounds with a slider.
- For 64 items: 5 rounds = 160 comparisons (vs. ~296 for a full sort).
- Any list size works — power-of-2 sizing is **not** required (odd counts get a bye each round).
- From round 3 on, if any items still have 0 wins, you're offered the chance to trim them from later rounds — as a group, or unchecking any you want to keep in play. Trimmed items stay in the results, in an **Eliminated** section, and in the export.
- When the rounds finish, the full ranking displays and exports as JSON.

## Make Your Own Ranker

Copy this folder, then edit three files — the engine (`bracket.js`) never changes:

1. **`items.js`** — your data. Sets `window.ITEMS`, an array of `{ id, title, ... }`. Add whatever extra fields you need (`artist`, `year`, `players`, `imdb`, …).
2. **`config.js`** — labels + how each item renders. Sets `window.BRACKET` (see contract below).
3. **`art-cache.js`** — optional `window.ART` map of `id → image URL`. Generate it with `fetch-art.js`, or write it by hand.

To rank a *different set of the same media type* (e.g. "my movies" vs. "her movies"), just swap `items.js` (and its `art-cache.js`) — `config.js` and `bracket.js` stay put.

### Config contract (`window.BRACKET`)

All fields optional. Item-derived text is escaped by the engine, so functions return **plain strings/data, never HTML**.

| Field | Type | Purpose |
| --- | --- | --- |
| `noun` / `nounPlural` | string | Labels, e.g. `"movie"` / `"movies"` |
| `prompt` | string | Matchup heading, e.g. `"Which do you like more?"` |
| `accent` | string | Brand color (hex); text / contrast / tint variants auto-derived |
| `recommendedRounds` / `maxRounds` | number | Suggested round count (drives the "recommended" note) and the hard cap |
| `cardLines(item)` | fn → `[{ text, className }]` | Extra lines under the title on a card (`className`: `sub` or `meta`) |
| `link(item)` | fn → `{ href, label, site }` \| `null` | Optional external-link icon (e.g. BGG, IMDb) |
| `listLine(item)` | fn → string | Suffix after the title in standings/results |
| `jsonFields` | string[] | Extra keys included in the JSON export |

### Theming

The styles default to a **light theme** with no background, so the bracket blends into a light host page. Add a modifier class to the wrapper element to change that:

- `bracket--dark` — dark theme.
- `bracket--plate` — adds a rounded background "plate" to bridge a theme mismatch when embedding on a host whose background doesn't match.

Set a brand color with `accent` in the config; the engine derives the readable text color, the on-accent (button label) color, and the hover tint automatically.

## Files

- [`index.html`](index.html) — markup + script wiring
- [`styles.css`](styles.css) — styling (scoped under `#bracket`)
- [`bracket-core.js`](bracket-core.js) — the ranking engine: pairing, scoring, tiers, export (no DOM)
- [`bracket.js`](bracket.js) — rendering and event wiring on top of the core (don't edit per-ranker)
- [`config.js`](config.js) — labels + rendering config (edit me)
- [`items.js`](items.js) — input data (edit me)
- [`art-cache.js`](art-cache.js) — generated `id → image URL` map
- [`fetch-art.js`](fetch-art.js) — album art fetcher example (`node fetch-art.js`)
- [`tests/`](tests) — engine tests (`npm test`)

## Tests

`npm test` runs the engine tests with Node's built-in test runner (Node 20+). No dependencies to install, and nothing to build — the app itself never loads them. CI runs the same command on every pull request.

The core is DOM-free and takes two injected seams: `rng` (so a run is reproducible from a seed) and `decide` (so a script can play a tournament instead of a human clicking cards). Tests use those to play thousands of rounds and assert invariants — wins are conserved, every item is scheduled exactly once per round, opponents are symmetric — plus ranking-quality properties measured against a known ground truth.

## License

[MIT](LICENSE).