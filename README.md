# Bracket

A small, dependency-free static web app for ranking **any** list of things by repeatedly picking the one you prefer in head-to-head matchups. It's a reusable **starter template**: point it at a set of albums, board games, movies, or whatever else, and it produces a full tiered ranking.

## Run It

Open [`index.html`](index.html) in any modern browser. No server, no build step, no dependencies. The bundled example ranks albums.

## How It Works

Instead of a full sort (`~n*log2(n)` comparisons), the app runs a **Swiss-system tournament** — a fixed number of rounds where items with similar records are paired against each other. After the rounds finish, items bucket into **tiers by win count**, with a Buchholz tiebreaker (sum of opponents' wins) ordering items within a tier.

- Fewer rounds → fewer comparisons, coarser tiers. You choose the number of rounds with a slider.
- For 64 items: 5 rounds = 160 comparisons (vs. ~296 for a full sort).
- Any list size works — power-of-2 sizing is **not** required (odd counts get a bye each round).
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
| `defaultRounds` / `maxRounds` | number | Rounds-slider default and cap |
| `cardLines(item)` | fn → `[{ text, className }]` | Extra lines under the title on a card (`className`: `sub` or `meta`) |
| `link(item)` | fn → `{ href, label, site }` \| `null` | Optional external link pill (e.g. BGG, IMDb) |
| `listLine(item)` | fn → string | Suffix after the title in standings/results |
| `jsonFields` | string[] | Extra keys included in the JSON export |

## Files

- [`index.html`](index.html) — markup + script wiring
- [`styles.css`](styles.css) — styling (scoped under `#bracket`)
- [`bracket.js`](bracket.js) — the engine (media-agnostic; don't edit per-ranker)
- [`config.js`](config.js) — labels + rendering config (edit me)
- [`items.js`](items.js) — input data (edit me)
- [`art-cache.js`](art-cache.js) — generated `id → image URL` map
- [`fetch-art.js`](fetch-art.js) — album art fetcher example (`node fetch-art.js`)

## Deployed Rankers

This template backs several rankers on [chrisglein.com](https://chrisglein.com): the album ranker, the board game ranker, and the movie ranker. Each is a copy of these files with its own `items.js` / `config.js`.