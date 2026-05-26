#!/usr/bin/env node
// Builds game-art-cache.js from one or more locally-saved BoardGameGeek
// collection HTML snapshots. Usage: node fetch-art.js
//
// Why local HTML and not the API?  BGG's XML API and HTML pages are currently
// behind Cloudflare/auth (401/403 to scripted requests), but the image CDN
// (cf.geekdo-images.com) is open. So the workflow is:
//
//   1. Visit https://boardgamegeek.com/collection/user/<your-user> in your
//      browser (signed in).
//   2. Save the page (Ctrl+S) as `collection.html` in this folder. If the
//      collection spans multiple pages, save each as `collection-2.html`,
//      `collection-3.html`, etc.  Any file matching `collection*.html` is
//      read and merged.
//   3. Run `node fetch-art.js`.
//
// For each game in games.js, the script finds a matching BGG entry by title
// (exact match first, then a "all words of the shorter title appear in the
// longer" fuzzy match for cases like "Quacks" vs "The Quacks of Quedlinburg")
// and writes the thumbnail URL to game-art-cache.js.

const fs = require("fs");
const path = require("path");

const gamesSrc = fs.readFileSync(path.join(__dirname, "games.js"), "utf-8");
const GAMES = new Function(gamesSrc + "\nreturn GAMES;")();

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function normTitle(s) {
  return s
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/^the\s+/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Parse one collection HTML file. Returns Map<normTitle, { id, title, art }>.
function parseCollection(html) {
  const out = new Map();
  // Each game is one <tr id="row_NNN"> ... </tr> block.
  const rowRe = /<tr id="row_\d+"[\s\S]*?<\/tr>/g;
  const rows = html.match(rowRe) || [];
  for (const row of rows) {
    // Title link — restrict to /boardgame/ (skip /boardgameexpansion/).
    const titleMatch = row.match(
      /<a href="\/boardgame\/(\d+)\/[^"]*" class="primary">([\s\S]*?)<\/a>/
    );
    if (!titleMatch) continue;
    const id = titleMatch[1];
    const title = decodeEntities(titleMatch[2]).replace(/\s+/g, " ").trim();

    // Thumbnail: prefer the @2x url from srcset (128px), else fall back to src (64px).
    let art = null;
    const imgMatch = row.match(/<img[^>]*srcset="([^"]+)"[^>]*src="([^"]+)"/);
    if (imgMatch) {
      const twoX = imgMatch[1].match(/(https:\S+)\s+2x/);
      art = twoX ? twoX[1] : imgMatch[2];
    } else {
      const srcMatch = row.match(/<img[^>]*src="(https:[^"]+)"/);
      if (srcMatch) art = srcMatch[1];
    }
    if (!art) continue;

    out.set(normTitle(title), { id, title, art });
  }
  return out;
}

function loadAllCollections(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^collection.*\.html?$/i.test(f))
    .sort();
  if (files.length === 0) return new Map();
  const merged = new Map();
  for (const f of files) {
    const html = fs.readFileSync(path.join(dir, f), "utf-8");
    const parsed = parseCollection(html);
    let added = 0;
    for (const [k, v] of parsed) {
      if (!merged.has(k)) {
        merged.set(k, v);
        added++;
      }
    }
    console.log(`  ${f}: ${parsed.size} games parsed, ${added} new`);
  }
  return merged;
}

// Fuzzy match: every word of the shorter title appears in the longer.
function fuzzyMatch(gameNorm, collection) {
  const gameWords = gameNorm.split(" ");
  const gameSet = new Set(gameWords);
  let best = null;
  let bestAmbiguous = false;
  for (const [k, v] of collection) {
    if (k === gameNorm) return v;
    const kWords = k.split(" ");
    const shorter = kWords.length < gameWords.length ? kWords : gameWords;
    const longerSet = kWords.length < gameWords.length ? gameSet : new Set(kWords);
    if (shorter.length === 0) continue;
    if (shorter.every((w) => longerSet.has(w))) {
      if (best && best.id !== v.id) {
        bestAmbiguous = true;
      } else {
        best = v;
      }
    }
  }
  return bestAmbiguous ? null : best;
}

function main() {
  console.log("Loading BGG collection snapshot(s) from workspace...");
  const collection = loadAllCollections(__dirname);
  if (collection.size === 0) {
    console.error(
      "\nNo collection*.html files found. Save your BGG collection page from\n" +
        "the browser as collection.html in this folder, then re-run.\n"
    );
    process.exit(1);
  }
  console.log(`Total unique entries: ${collection.size}\n`);

  const cache = {};
  const usedIds = new Set();
  const failures = [];
  const ambiguous = [];

  for (const game of GAMES) {
    // Explicit override on the game entry wins.
    if (game.art) {
      cache[game.id] = game.art;
      console.log(`OK   ${game.title.padEnd(34)} -> (override)`);
      continue;
    }

    const norm = normTitle(game.title);
    const hit = fuzzyMatch(norm, collection);
    if (hit && !usedIds.has(hit.id)) {
      cache[game.id] = hit.art;
      usedIds.add(hit.id);
      const matchKind = norm === normTitle(hit.title) ? "exact" : "fuzzy";
      console.log(`OK   ${game.title.padEnd(34)} -> BGG #${hit.id}  (${matchKind}: "${hit.title}")`);
    } else if (hit && usedIds.has(hit.id)) {
      ambiguous.push({ game, hit });
      console.log(`SKIP ${game.title.padEnd(34)} -> BGG #${hit.id} already used by another game`);
    } else {
      failures.push(game);
      console.log(`MISS ${game.title}`);
    }
  }

  // Write the cache file in games.js order.
  const ordered = GAMES.filter((g) => cache[g.id]).map((g) => [g.id, cache[g.id]]);
  const entries = ordered
    .map(([id, url]) => `  ${JSON.stringify(id)}: ${JSON.stringify(url)}`)
    .join(",\n");
  const output = `// Auto-generated by fetch-art.js -- do not edit manually.\nconst GAME_ART = {\n${entries}\n};\n`;
  fs.writeFileSync(path.join(__dirname, "game-art-cache.js"), output, "utf-8");

  console.log(`\nWrote ${ordered.length}/${GAMES.length} entries to game-art-cache.js`);
  if (failures.length) {
    console.log("\nNot found in collection snapshot(s):");
    for (const g of failures) console.log(`  - ${g.id}: ${g.title}`);
    console.log(
      "\nFix: save additional collection page(s) as collection-2.html, " +
        "collection-3.html, etc., then re-run."
    );
  }
  if (ambiguous.length) {
    console.log("\nAmbiguous matches (already used by another game):");
    for (const a of ambiguous) console.log(`  - ${a.game.id} (${a.game.title})`);
  }
}

main();
