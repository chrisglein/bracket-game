"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  Core,
  makeRng,
  randomDecider,
  playRounds,
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

// The top score is not the round number: a lone leader who is paired down and
// loses drops the whole field a win behind. Round count has to come from the
// total instead, or a resumed run reports the wrong round and mis-times the
// elimination offer.
test("an import recovers the exact round, comparison, and bye counts", async () => {
  let fieldsBehind = 0;

  for (let seed = 1; seed <= 40; seed++) {
    const items = makeItems(5 + (seed % 9));
    const rounds = 2 + (seed % 3);
    const t = Core.createTournament(items, { rng: makeRng(seed) });
    await playRounds(t, rounds, randomDecider(makeRng(seed + 500)));

    const topScore = Math.max(...t.active.map((item) => t.stats.get(item.id).wins));
    if (topScore < rounds) fieldsBehind++;

    const restored = Core.importRanking(JSON.stringify(Core.buildJson(t)), items, {
      noun: "item",
      nounPlural: "items",
      maxRounds: items.length - 1,
    });
    const where = `seed ${seed}, ${items.length} items, ${rounds} rounds`;
    assert.strictEqual(restored.tournament.round, rounds, where);
    assert.strictEqual(restored.tournament.comparisons, t.comparisons, where);
    assert.strictEqual(restored.tournament.byesAwarded, t.byesAwarded, where);
    assert.strictEqual(restored.exactComparisonCount, true, where);
  }

  assert.ok(fieldsBehind > 0, "sweep never produced a field trailing the round count");
});

test("a trimmed pool reports its round count as inexact", async () => {
  const items = makeItems(21);
  const t = Core.createTournament(items, { rng: makeRng(31) });
  await playChecked(t, 3, randomDecider(makeRng(32)), "inexact import");
  Core.eliminate(t, Core.eliminationCandidates(t));

  const restored = Core.importRanking(JSON.stringify(Core.buildJson(t)), items, {
    noun: "item",
    nounPlural: "items",
    maxRounds: items.length - 1,
  });

  assert.strictEqual(restored.exactComparisonCount, false);
  assert.strictEqual(restored.tournament.round, 3);
});

test("a resumed tournament keeps playing and still balances its books", async () => {
  const items = makeItems(19);
  const t = Core.createTournament(items, { rng: makeRng(70) });
  await playChecked(t, 3, randomDecider(makeRng(71)), "pre-import");

  const restored = Core.importRanking(JSON.stringify(Core.buildJson(t)), items, {
    noun: "item",
    nounPlural: "items",
    maxRounds: items.length - 1,
  });
  const resumed = restored.tournament;
  resumed.rng = makeRng(72);

  await playRounds(resumed, 2, randomDecider(makeRng(73)));

  // The full invariant sweep cannot run past an import: the export carries no
  // opponent history, so per-item "wins <= matchups played" is unknowable.
  // Conservation across the whole field still has to hold, and it is the check
  // that catches a botched reconstruction.
  let totalWins = 0;
  for (const s of resumed.stats.values()) totalWins += s.wins;
  assert.strictEqual(totalWins, resumed.comparisons + resumed.byesAwarded);

  assert.strictEqual(resumed.round, 5);
  assert.strictEqual(resumed.active.length + resumed.eliminated.length, items.length);
  for (const item of items) {
    assert.ok(
      resumed.stats.get(item.id).wins >= t.stats.get(item.id).wins,
      `${item.id} lost wins across the resume`
    );
  }
});

test("malformed pastes are rejected instead of resuming a broken session", async () => {
  const items = makeItems(12);
  const t = Core.createTournament(items, { rng: makeRng(80) });
  await playRounds(t, 3, randomDecider(makeRng(81)));
  const ranking = Core.buildJson(t);
  const opts = { noun: "item", nounPlural: "items", maxRounds: items.length - 1 };
  const edited = (index, patch) =>
    JSON.stringify(ranking.map((e, i) => (i === index ? { ...e, ...patch } : e)));

  const cases = [
    ["", /Paste exported JSON or email text/],
    ["   \n  ", /Paste exported JSON or email text/],
    ["just some prose\nwith no headings", /Paste exported JSON or the email body/],
    ['{"rank":1}', /must be an array/],
    ["[1, 2, 3]", /must contain objects/],
    [JSON.stringify(ranking.slice(1)), /Expected 12 items in the export, found 11/],
    [edited(0, { id: "not-an-item" }), /does not match the loaded items/],
    [JSON.stringify([ranking[0], ...ranking.slice(2), ranking[0]]), /Duplicate item/],
    [JSON.stringify([...ranking].reverse()), /sorted from most wins to fewest/],
    [edited(0, { wins: "three" }), /whole-number win count/],
    [edited(0, { wins: -1 }), /whole-number win count/],
    [edited(0, { wins: 99 }), /only supports 11/],
    [JSON.stringify(ranking.map((e) => ({ ...e, wins: 0 }))), /does not include any completed rounds/],
    [edited(0, { eliminated: true }), /must stay at 0 wins/],
    ["Alpha\n## 1 Win\nBravo", /must start with a '## N Wins' heading/],
    ["## 1 Win\nNot A Loaded Item", /Could not match this imported line/],
  ];

  for (const [text, expected] of cases) {
    assert.throws(() => Core.importRanking(text, items, opts), expected, `accepted: ${text.slice(0, 40)}`);
  }
});
