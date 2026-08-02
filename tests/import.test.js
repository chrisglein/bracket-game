"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  Core,
  makeRng,
  randomDecider,
  playChecked,
} = require("./helpers.js");

const { albums, albumJsonFields } = require("./fixtures/albums.js");
const { makeItems } = require("./fixtures/fruits.js");
const albumExport = require("./fixtures/albums-export.json");

function albumListLine(item) {
  return `${item.artist}${item.year ? ` (${item.year})` : ""}`;
}

function albumEntryLine(entry) {
  const suffix = albumListLine(entry);
  return entry.title === "Continuum" ? `${entry.title} — ${suffix}` : entry.title;
}

test("email export uses item summaries so duplicate titles stay resumable", () => {
  const { body } = Core.buildEmailContent(albumExport, {
    noun: "album",
    entryLine: albumEntryLine,
  });

  assert.ok(body.includes("Continuum — John Mayer (2006)"));
  assert.ok(body.includes("Continuum — Tanerelle"));
});

test("json import restores the active and eliminated pools", async () => {
  const items = makeItems(24);
  const t = Core.createTournament(items, { rng: makeRng(90) });
  await playChecked(t, 3, randomDecider(makeRng(91)), "import json");
  Core.eliminate(t, Core.eliminationCandidates(t));

  const ranking = Core.buildJson(t);
  const restored = Core.importRanking(JSON.stringify(ranking), items, {
    noun: "item",
    nounPlural: "items",
    maxRounds: items.length - 1,
  });

  assert.strictEqual(restored.tournament.round, t.round);
  assert.deepStrictEqual(Core.buildJson(restored.tournament), ranking);
});

test("email import restores a real exported ranking with duplicate titles", () => {
  const { body } = Core.buildEmailContent(albumExport, {
    noun: "album",
    entryLine: albumEntryLine,
  });

  const restored = Core.importRanking(body, albums, {
    noun: "album",
    nounPlural: "albums",
    listLine: albumListLine,
    maxRounds: 8,
  });

  const ranking = Core.buildJson(restored.tournament, { jsonFields: albumJsonFields });
  assert.deepStrictEqual(ranking, albumExport);
});

test("truncated email exports are rejected", () => {
  assert.throws(
    () => Core.importRanking("## 1 Win\nAlpha\n\n(truncated, use Copy JSON for the full ranking)", [{ id: "alpha", title: "Alpha" }], {
      noun: "item",
      nounPlural: "items",
      maxRounds: 1,
    }),
    /Truncated email exports cannot be resumed/
  );
});
