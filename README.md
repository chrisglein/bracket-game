# Bracket

A small, dependency-free static web app for ranking **any** list of things by repeatedly picking the one you prefer in head-to-head matchups. It's a reusable **starter template**: point it at a set of albums, board games, movies, or whatever else, and it produces a full tiered ranking.

![Screenshot of the tool with 3 different media types](/bracket-game.png)

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

### Example: ranking movies

**`items.js`**
```js
window.ITEMS = [
  { id: "parasite",       title: "Parasite",              director: "Bong Joon-ho",  year: 2019 },
  { id: "everything-ewt", title: "Everything Everywhere", director: "Daniels",       year: 2022 },
  { id: "the-lobster",    title: "The Lobster",           director: "Yorgos Lanthimos", year: 2015 },
  { id: "hereditary",     title: "Hereditary",            director: "Ari Aster",     year: 2018 },
  // … add as many as you like
];
```

**`config.js`**
```js
window.BRACKET = {
  noun: "movie",
  nounPlural: "movies",
  prompt: "Which movie do you prefer?",
  accent: "#e50914",          // brand color (hex); pick any color
  recommendedRounds: 4,

  // Extra lines shown under the title on each matchup card.
  cardLines: (item) => [
    { text: item.director, className: "sub" },
    { text: String(item.year), className: "meta" },
  ],

  // Optional: link to IMDb for each movie.
  link: (item) => item.imdb
    ? { href: `https://www.imdb.com/title/${item.imdb}/`, label: "IMDb", site: "imdb" }
    : null,

  // Suffix after the title in the standings + final results lists.
  listLine: (item) => `${item.director} (${item.year})`,

  // Extra fields to include in the JSON export.
  jsonFields: ["director", "year"],
};
```

**`art-cache.js`** (optional — omit or leave empty if you have no images)
```js
window.ART = {
  "parasite":       "https://example.com/posters/parasite.jpg",
  "everything-ewt": "https://example.com/posters/eeaao.jpg",
  // … one entry per item id
};
```

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
- [`bracket.js`](bracket.js) — the engine (media-agnostic; don't edit per-ranker)
- [`config.js`](config.js) — labels + rendering config (edit me)
- [`items.js`](items.js) — input data (edit me)
- [`art-cache.js`](art-cache.js) — generated `id → image URL` map
- [`fetch-art.js`](fetch-art.js) — album art fetcher example (`node fetch-art.js`)

## License

[MIT](LICENSE).