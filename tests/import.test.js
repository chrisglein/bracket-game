"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  Core,
  makeRng,
  randomDecider,
  noisyDecider,
  indexRanker,
  playRounds,
  playChecked,
} = require("./helpers.js");

const { albums, albumJsonFields } = require("./fixtures/albums.js");
const { makeItems } = require("./fixtures/fruits.js");
const albumExport = require("./fixtures/albums-export.json");

function albumListLine(item) {
  return `${item.artist}${item.year ? ` (${item.year})` : ""}`;
}

const albumOptions = {
  noun: "album",
  nounPlural: "albums",
  listLine: albumListLine,
  maxRounds: 8,
};

// Mirrors what bracket.js sends to the email export: bare titles, qualified
// only where a title is ambiguous. Duplicating the rule here is the point —
// if the UI stops matching it, the round trip breaks.
function albumEntryLine(entry) {
  const titleCounts = new Map();
  for (const album of albums) titleCounts.set(album.title, (titleCounts.get(album.title) || 0) + 1);
  return titleCounts.get(entry.title) > 1 ? `${entry.title} — ${albumListLine(entry)}` : entry.title;
}

function albumEmail(ranking) {
  return Core.buildEmailContent(ranking, { noun: "album", entryLine: albumEntryLine }).body;
}

// The state a player actually exports from: the real 71-album list, several
// rounds deep, with byes, winless albums the player chose to keep, and a
// trimmed pool. Synthetic even-sized sweeps miss all four.
async function midSession(seed, rounds) {
  const t = Core.createTournament(albums, { rng: makeRng(seed) });
  await playRounds(t, rounds, noisyDecider(indexRanker(albums), 0.8, makeRng(seed + 1)));
  Core.eliminate(t, Core.eliminationCandidates(t).slice(1));
  return t;
}

function assertRepresentative(t) {
  assert.ok(t.byesAwarded > 0, "fixture stopped exercising byes");
  assert.ok(t.eliminated.length > 0, "fixture stopped exercising a trimmed pool");
  assert.ok(
    t.active.some((item) => t.stats.get(item.id).wins === 0),
    "fixture stopped exercising winless survivors"
  );
}

test("email export uses item summaries so duplicate titles stay resumable", () => {
  const body = albumEmail(albumExport);

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
  const restored = Core.importRanking(albumEmail(albumExport), albums, albumOptions);

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

// --- Mid-session resume ---
// Everything above imports a tidy synthetic state. These run the shape a real
// player pastes in: partway through the real list, mid-trim, both formats.

test("a mid-session export round-trips through JSON and email alike", async () => {
  const t = await midSession(11, 4);
  assertRepresentative(t);
  const ranking = Core.buildJson(t, { jsonFields: albumJsonFields });

  for (const [format, text] of [["json", JSON.stringify(ranking)], ["email", albumEmail(ranking)]]) {
    const restored = Core.importRanking(text, albums, albumOptions);
    assert.deepStrictEqual(
      Core.buildJson(restored.tournament, { jsonFields: albumJsonFields }),
      ranking,
      `${format} import changed the ranking`
    );
    assert.deepStrictEqual(
      restored.tournament.eliminated.map((item) => item.id),
      t.eliminated.map((item) => item.id),
      `${format} import lost the trimmed pool`
    );
  }
});

test("a resumed mid-session run plays on and exports something resumable again", async () => {
  const t = await midSession(12, 3);
  assertRepresentative(t);
  const first = Core.buildJson(t, { jsonFields: albumJsonFields });

  const resumed = Core.importRanking(JSON.stringify(first), albums, albumOptions).tournament;
  resumed.rng = makeRng(212);
  await playRounds(resumed, 2, noisyDecider(indexRanker(albums), 0.8, makeRng(213)));
  assert.strictEqual(resumed.round, t.round + 2);

  let totalWins = 0;
  for (const s of resumed.stats.values()) totalWins += s.wins;
  assert.strictEqual(totalWins, resumed.comparisons + resumed.byesAwarded);

  const second = Core.buildJson(resumed, { jsonFields: albumJsonFields });
  const twice = Core.importRanking(albumEmail(second), albums, albumOptions);
  assert.deepStrictEqual(
    Core.buildJson(twice.tournament, { jsonFields: albumJsonFields }),
    second,
    "a resumed session's own export is not resumable"
  );
});

test("a resumed run can still trim the winless albums it inherited", async () => {
  const t = await midSession(13, 3);
  const resumed = Core.importRanking(
    JSON.stringify(Core.buildJson(t, { jsonFields: albumJsonFields })),
    albums,
    albumOptions
  ).tournament;

  const candidates = Core.eliminationCandidates(resumed);
  assert.ok(candidates.length > 0, "resume did not carry enough rounds to offer a trim");
  const remaining = resumed.active.length - candidates.length;
  Core.eliminate(resumed, candidates);
  assert.strictEqual(resumed.active.length, remaining);
  assert.strictEqual(Core.comparisonsPerRound(resumed), Math.floor(remaining / 2));

  resumed.rng = makeRng(214);
  await playRounds(resumed, 1, noisyDecider(indexRanker(albums), 0.8, makeRng(215)));
  assert.strictEqual(resumed.active.length, remaining);
});

test("an export at the round cap resumes, one past it is refused", async () => {
  const t = Core.createTournament(albums, { rng: makeRng(14) });
  await playRounds(t, 4, noisyDecider(indexRanker(albums), 0.8, makeRng(15)));
  const text = JSON.stringify(Core.buildJson(t, { jsonFields: albumJsonFields }));

  const atCap = Core.importRanking(text, albums, { ...albumOptions, maxRounds: 4 });
  assert.strictEqual(atCap.tournament.round, 4);
  assert.throws(
    () => Core.importRanking(text, albums, { ...albumOptions, maxRounds: 3 }),
    /shows 4 rounds, but the loaded setup only supports 3/
  );
});

// Ids are matched as strings but handed back in their original type, so a
// numeric-id ranker must still find its own stats after an import.
test("numeric ids survive an import", async () => {
  const numeric = [
    { id: 1, title: "One" },
    { id: 2, title: "Two" },
    { id: 3, title: "Three" },
    { id: 4, title: "Four" },
    { id: 5, title: "Five" },
  ];
  const t = Core.createTournament(numeric, { rng: makeRng(105) });
  await playChecked(t, 2, randomDecider(makeRng(106)), "numeric ids");
  const ranking = Core.buildJson(t);

  const restored = Core.importRanking(JSON.stringify(ranking), numeric, {
    noun: "item",
    nounPlural: "items",
    maxRounds: 4,
  });
  assert.strictEqual(typeof restored.tournament.active[0].id, "number", "id type changed");
  assert.deepStrictEqual(Core.buildJson(restored.tournament), ranking);
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
