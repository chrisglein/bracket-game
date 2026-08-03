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
- When the rounds finish, the full ranking displays and exports as JSON or email text, and either export can be pasted back into Setup to resume with more rounds. Resuming from an export also offers the trim prompt, since picking a ranking back up is a natural moment to drop items.

## Make Your Own Ranker

Copy this folder, then edit three files — the engine (`bracket.js` and `bracket-core.js`) never changes:

1. **`items.js`** — your data. Sets `window.ITEMS`, an array of `{ id, title, ... }`. Add whatever extra fields you need (`artist`, `year`, `players`, `imdb`, …).
2. **`config.js`** — labels + how each item renders. Sets `window.BRACKET` (see contract below).
3. **`art-cache.js`** — optional `window.ART` map of `id → image URL`. Generate it with `fetch-art.js`, or write it by hand.

To rank a *different set of the same media type* (e.g. "my movies" vs. "her movies"), either swap `items.js` (and its `art-cache.js`), or list both sets under `datasets` so the app opens with a picker — see [Multiple sets in one ranker](#multiple-sets-in-one-ranker).

### Example: ranking movies

**`items.js`** — `id` must be unique (it keys the art map and the export); everything past `id` and `title` is yours to invent.
```js
window.ITEMS = [
  { id: "parasite",       title: "Parasite",              director: "Bong Joon-ho",     year: 2019, imdb: "tt6751668" },
  { id: "everything-ewt", title: "Everything Everywhere", director: "Daniels",          year: 2022, imdb: "tt6710474" },
  { id: "the-lobster",    title: "The Lobster",           director: "Yorgos Lanthimos", year: 2015, imdb: "tt3464902" },
  { id: "hereditary",     title: "Hereditary",            director: "Ari Aster",        year: 2018, imdb: "tt7784604" },
  // … add as many as you like
];
```

**`config.js`**
```js
window.BRACKET = {
  noun: "movie",
  nounPlural: "movies",
  prompt: "Which movie do you prefer?",
  intro: "Pick the movie you prefer in each matchup. Movies land in tiers by wins.",
  accent: "#5b8def",          // brand color (hex); pick any color
  recommendedRounds: 4,
  maxRounds: 8,

  // Extra lines shown under the title on each matchup card.
  cardLines: (item) => [
    { text: item.director, className: "sub" },
    { text: item.year, className: "meta" },
  ],

  // Optional: link to IMDb for each movie.
  link: (item) => item.imdb
    ? { href: `https://www.imdb.com/title/${item.imdb}/`, label: "IMDb", site: "IMDb" }
    : null,

  // Suffix after the title in the standings + final results lists.
  listLine: (item) => `${item.director} (${item.year})`,

  // Extra fields to include in the JSON export.
  jsonFields: ["director", "year"],
};
```

**`art-cache.js`** (optional — the app falls back to an empty map if the file is missing)
```js
window.ART = {
  "parasite":       "https://example.com/posters/parasite.jpg",
  "everything-ewt": "https://example.com/posters/eeaao.jpg",
  // … one entry per item id
};
```

`fetch-art.js` generates this file from the iTunes album API, so it only fits albums — for other media, write the map by hand or swap the fetcher's lookup.

### Config contract (`window.BRACKET`)

All fields optional. Item-derived text is escaped by the engine, so functions return **plain strings/data, never HTML**.

| Field | Type | Purpose |
| --- | --- | --- |
| `noun` / `nounPlural` | string | Labels, e.g. `"movie"` / `"movies"` |
| `prompt` | string | Matchup heading, e.g. `"Which do you like more?"` |
| `intro` | string | One-line explanation shown in the Setup box |
| `accent` | string | Brand color (hex); text / contrast / tint variants auto-derived |
| `recommendedRounds` / `maxRounds` | number | Suggested round count (drives the "recommended" note) and the hard cap |
| `cardLines(item)` | fn → `[{ text, className }]` | Extra lines under the title on a card (`className`: `sub` or `meta`) |
| `link(item)` | fn → `{ href, label, site }` \| `null` | Optional external-link icon (e.g. BGG, IMDb) |
| `listLine(item)` | fn → string | Suffix after the title in standings/results |
| `jsonFields` | string[] | Extra keys included in the JSON export |
| `storageKey` | string | Suffix for the saved-progress key; set it when several rankers share one origin |
| `datasets` | `[{ id, label, blurb, items, art, recommendedRounds }]` | Two or more item sets for the same media type. When present, Setup opens with a picker instead of using `window.ITEMS` |

### Multiple sets in one ranker

One ranker can offer several item sets — same labels, same card rendering, different lists. Give each set an `id`, a `label`, and its own `items` / `art`:

```js
window.BRACKET.datasets = [
  { id: "mine",  label: "My Movies",  blurb: "The ones I own.", items: window.ITEMS_MINE,  art: window.ART_MINE },
  { id: "hers",  label: "Her Movies", items: window.ITEMS_HERS, art: window.ART_HERS },
];
```

Since each set's `items` and `art` come from separate data files, assign `datasets` *after* those files load rather than inside the main `window.BRACKET` literal.

With `datasets` set, the app opens on a **Choose a Set** screen: one card per set showing its name, item count, blurb, and a teaser strip of cover art, plus an "In progress" badge when that set has saved progress. Each set gets its own saved-progress slot (the set `id` is appended to `storageKey`), so two rankings can be in flight at once. Picking a set resumes it if it was in progress; **Choose a different set** on the Setup screen goes back to the picker. A ranker with no `datasets` behaves exactly as before, reading `window.ITEMS` and `window.ART`.

### Theming

The styles default to a **light theme** with no background, so the bracket blends into a light host page. Add a modifier class to the wrapper element to change that:

- `bracket--dark` — dark theme.
- `bracket--plate` — adds a rounded background "plate" to bridge a theme mismatch when embedding on a host whose background doesn't match.

Set a brand color with `accent` in the config; the engine derives the readable text color, the on-accent (button label) color, and the hover tint automatically.

## Files

- [`index.html`](index.html) — markup + script wiring
- [`styles.css`](styles.css) — styling (scoped under `#bracket`)
- [`bracket-core.js`](bracket-core.js) — the ranking engine: pairing, scoring, tiers, export, save/resume (no DOM)
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