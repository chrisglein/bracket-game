# Album Ranker

A small static web app for ranking a list of albums by repeatedly picking the one you prefer in head-to-head matchups.

## Run It

Just open [`index.html`](index.html) in any modern browser. No server, no build step, no dependencies.

## How It Works

- Albums are loaded from [`albums.js`](albums.js).
- Under the hood, they're sorted using **merge sort** — every comparison the algorithm needs becomes a "pick A or B" matchup for you.
- This guarantees a complete, correct ordering of every album in `~n*log2(n)` comparisons:
  - 8 albums → ~17 picks
  - 16 albums → ~49 picks
  - 64 albums → ~296 picks
- When sorting finishes, the full ranking displays and exports as JSON.

## Initial Test Data

The bundled list is 8 picks from the HiFi vinyl wishlist (Chris's rank=1 selections). Edit `albums.js` to swap in any list — power-of-2 sizing is **not** required with this algorithm.

## Files

- [`index.html`](index.html) — markup
- [`styles.css`](styles.css) — styling
- [`albums.js`](albums.js) — input data (edit me)
- [`script.js`](script.js) — ranking logic + UI

## Design Notes

The original spec asked for a single-elimination bracket with placement rounds. That approach matches the visual idea of a "bracket" but doesn't actually produce a defensible full ranking without nearly as many additional placement matches as merge sort uses anyway. Merge sort is simpler, correct by construction, and shows a partial "current standings" preview as merges complete.

# To Improve

- Just tried it out. Very cool. But it feels like it asks for too many comparisons. We don't need a bulletproof sort here. Rough bucketing would be enough, and if that can be done with fewer comparisons, it's worth it.
- Full album list: [Albums.md](Albums.md)