# Board Game Ranker

A small static web app for ranking a list of board games by repeatedly picking the one you'd rather play in head-to-head matchups. Adapted from the original [Album Ranker](https://github.com/chrisglein/bracket-game).

## Run It

Just open [`index.html`](index.html) in any modern browser. No server, no build step, no dependencies.

## How It Works

- Games are loaded from [`games.js`](games.js).
- Cover art is loaded from [`game-art-cache.js`](game-art-cache.js) (auto-generated from BoardGameGeek).
- Ranking runs as a **Swiss-system tournament**: a fixed number of rounds where games with similar records are paired against each other. After all rounds, games bucket into tiers by win count, with a Buchholz tiebreaker (sum of opponents' wins) ordering within tiers.
- For 32 games at 5 rounds, that's 80 comparisons producing up to 6 tiers — much less than a full sort while still giving a defensible ranking.
- When ranking finishes, the full standing displays and exports as JSON.

## Fetching Cover Art

BoardGameGeek's XML API and HTML pages are currently behind Cloudflare/auth and return 401/403 to scripted requests — but the image CDN (`cf.geekdo-images.com`) is open, so once we have URLs the app loads art fine.

The workflow is to import a locally-saved collection page:

1. In your browser (signed in to BGG), open your collection page, e.g. `https://boardgamegeek.com/collection/user/<your-user>`.
2. Save the page (Ctrl+S) as `collection.html` in this folder. If the collection spans multiple pages, save each one as `collection-2.html`, `collection-3.html`, etc. The script reads any file matching `collection*.html`.
3. Run `node fetch-art.js` to regenerate [`game-art-cache.js`](game-art-cache.js).

The script matches games by normalized title (with a fuzzy fallback so e.g. "Quacks" in the collection matches "The Quacks of Quedlinburg" in `games.js`) and reports any misses. To resolve a miss, save a snapshot of a collection page that contains it (or any other BGG-visible page with the game's thumbnail URL), then re-run.

## Files

- [`index.html`](index.html) — markup
- [`styles.css`](styles.css) — styling
- [`games.js`](games.js) — input data (edit me)
- [`game-art-cache.js`](game-art-cache.js) — generated cover-art URLs
- [`fetch-art.js`](fetch-art.js) — Node script that populates the art cache
- [`script.js`](script.js) — ranking logic + UI

## Game List

The bundled list is 32 board games the friend group has played together (see [`Board Game Bracket for the Boys.md`](Board%20Game%20Bracket%20for%20the%20Boys.md)). 32 is a power of 2, so no byes are needed.
