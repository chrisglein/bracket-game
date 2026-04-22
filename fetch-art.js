#!/usr/bin/env node
// Fetches album art URLs from the iTunes Search API and writes album-art-cache.js.
// Usage: node fetch-art.js
//
// Reads ALBUMS from albums.js, queries iTunes for each, and produces a JS file
// that maps album IDs to artwork URLs. The generated file is loaded by the app
// so it works offline from the local file system.

const fs = require("fs");
const path = require("path");

// --- Load ALBUMS from albums.js ---
const albumsSrc = fs.readFileSync(path.join(__dirname, "albums.js"), "utf-8");
// Execute in a mini-context to extract the constant
const fn = new Function(albumsSrc + "\nreturn ALBUMS;");
const ALBUMS = fn();

const DELAY_MS = 120; // ~8 req/sec to stay well under iTunes rate limits

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchArt(album) {
  // Try multiple query strategies
  const queries = [
    `${album.artist} ${album.title}`,
    album.title,
    `${album.artist} ${album.title.replace(/[^a-zA-Z0-9 ]/g, '')}`,
  ];

  for (const q of queries) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=album&limit=5`;
    const resp = await fetch(url);
    if (!resp.ok) continue;

    const data = await resp.json();
    if (!data.results || data.results.length === 0) continue;

    // Try to find a close match on album name
    const titleLower = album.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const artistLower = album.artist.toLowerCase();
    const match =
      data.results.find(
        (r) => r.collectionName &&
          r.collectionName.toLowerCase().replace(/[^a-z0-9]/g, '').includes(titleLower)
      ) ||
      data.results.find(
        (r) => r.artistName && r.artistName.toLowerCase().includes(artistLower)
      ) ||
      null;

    if (match && match.artworkUrl100) {
      return match.artworkUrl100.replace("100x100", "600x600");
    }
  }

  // Last resort: just search the artist and take the first album result
  const fallbackUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(album.artist)}&entity=album&limit=5`;
  const resp = await fetch(fallbackUrl);
  if (resp.ok) {
    const data = await resp.json();
    if (data.results && data.results.length > 0) {
      const titleLower = album.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = data.results.find(
        (r) => r.collectionName &&
          r.collectionName.toLowerCase().replace(/[^a-z0-9]/g, '').includes(titleLower)
      );
      if (match && match.artworkUrl100) {
        return match.artworkUrl100.replace("100x100", "600x600");
      }
    }
  }

  // Fallback: MusicBrainz + Cover Art Archive
  return fetchArtMusicBrainz(album);
}

async function fetchArtMusicBrainz(album) {
  const query = encodeURIComponent(`artist:${album.artist} AND release:${album.title}`);
  const url = `https://musicbrainz.org/ws/2/release/?query=${query}&fmt=json&limit=3`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "AlbumRankerArtFetcher/1.0 (local-tool)" },
  });
  if (!resp.ok) return null;

  const data = await resp.json();
  if (!data.releases || data.releases.length === 0) return null;

  // Pick the best-scoring release that has a front cover
  for (const release of data.releases) {
    if (release.score < 80) continue;
    try {
      const caResp = await fetch(
        `https://coverartarchive.org/release/${release.id}`,
        { redirect: "follow" }
      );
      if (!caResp.ok) continue;

      const caData = await caResp.json();
      const front = caData.images && caData.images.find((img) => img.front);
      if (front) {
        // Prefer 500px thumbnail, fall back to full image
        return (front.thumbnails && (front.thumbnails["500"] || front.thumbnails["large"])) || front.image;
      }
    } catch {
      continue;
    }
    await sleep(DELAY_MS);
  }

  return null;
}

async function main() {
  // Load existing cache if present, so we only fetch missing entries
  const cachePath = path.join(__dirname, "album-art-cache.js");
  let existing = {};
  if (fs.existsSync(cachePath)) {
    try {
      const src = fs.readFileSync(cachePath, "utf-8");
      const fn2 = new Function(src + "\nreturn ALBUM_ART;");
      existing = fn2();
      console.log(`Loaded ${Object.keys(existing).length} cached entries.`);
    } catch {
      console.log("Could not parse existing cache; will re-fetch all.");
    }
  }

  const cache = { ...existing };
  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  for (const album of ALBUMS) {
    if (cache[album.id]) {
      skipped++;
      continue;
    }

    process.stdout.write(`Fetching: ${album.artist} – ${album.title} ... `);
    try {
      const artUrl = await fetchArt(album);
      if (artUrl) {
        cache[album.id] = artUrl;
        console.log("OK");
        fetched++;
      } else {
        console.log("not found");
        failed++;
      }
    } catch (err) {
      console.log(`error: ${err.message}`);
      failed++;
    }
    await sleep(DELAY_MS);
  }

  // Write cache file
  const entries = Object.entries(cache)
    .map(([id, url]) => `  ${JSON.stringify(id)}: ${JSON.stringify(url)}`)
    .join(",\n");

  const output = `// Auto-generated by fetch-art.js — do not edit manually.\nconst ALBUM_ART = {\n${entries}\n};\n`;
  fs.writeFileSync(cachePath, output, "utf-8");

  console.log(
    `\nDone. ${fetched} fetched, ${skipped} cached, ${failed} not found. ` +
      `${Object.keys(cache).length} total entries written to album-art-cache.js`
  );
}

main();
