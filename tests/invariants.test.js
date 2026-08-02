"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  Core,
  makeRng,
  randomDecider,
  perfectDecider,
  indexRanker,
  playChecked,
  assertInvariants,
  assertPairing,
} = require("./helpers.js");

const { fruits, oddFruits, twoFruits, makeItems } = require("./fixtures/fruits.js");
const { albums } = require("./fixtures/albums.js");
const albumExport = require("./fixtures/albums-export.json");

test("a fresh tournament starts clean", () => {
  const t = Core.createTournament(fruits, { rng: makeRng(1) });
  assert.strictEqual(t.active.length, 8);
  assert.strictEqual(t.eliminated.length, 0);
  assert.strictEqual(t.round, 0);
  assert.strictEqual(t.comparisons, 0);
  assertInvariants(t, "fresh");
});

test("createTournament does not mutate the caller's item array", () => {
  const items = fruits.slice();
  const before = items.map((i) => i.id);
  Core.createTournament(items, { rng: makeRng(7) });
  assert.deepStrictEqual(items.map((i) => i.id), before);
});

test("same seed produces the same tournament", async () => {
  const run = async () => {
    const t = Core.createTournament(fruits, { rng: makeRng(99) });
    await playChecked(t, 3, randomDecider(makeRng(99)), "seeded");
    return Core.computeRanking(t).map((i) => i.id);
  };
  assert.deepStrictEqual(await run(), await run());
});

test("different seeds produce different tournaments", async () => {
  const run = async (seed) => {
    const t = Core.createTournament(makeItems(32), { rng: makeRng(seed) });
    await playChecked(t, 4, randomDecider(makeRng(seed)), `seed ${seed}`);
    return Core.computeRanking(t).map((i) => i.id).join(",");
  };
  assert.notStrictEqual(await run(1), await run(2));
});

// The core sweep. Every size from the smallest playable tournament up, both
// parities, checked after every round.
test("invariants hold across item counts and rounds", async () => {
  for (let n = 2; n <= 40; n++) {
    const items = makeItems(n);
    const t = Core.createTournament(items, { rng: makeRng(n * 7919) });
    const rounds = Math.min(6, Math.max(1, n - 1));
    await playChecked(t, rounds, randomDecider(makeRng(n)), `n=${n}`);
  }
});

test("every active item is scheduled or given a bye, every round", async () => {
  for (const n of [2, 3, 7, 8, 15, 64, 71]) {
    const t = Core.createTournament(makeItems(n), { rng: makeRng(n) });
    const decide = randomDecider(makeRng(n + 1));
    for (let r = 0; r < 5; r++) {
      await Core.playRound(t, decide, {
        onRoundStart: (tt, pairs, bye) => assertPairing(tt, pairs, bye, `n=${n} r=${tt.round}`),
      });
    }
  }
});

test("odd fields give exactly one bye per round, spread fairly", async () => {
  const t = Core.createTournament(oddFruits, { rng: makeRng(4) });
  await playChecked(t, 7, randomDecider(makeRng(5)), "odd");
  assert.strictEqual(t.byesAwarded, 7);
  // 7 items, 7 rounds: everyone sits out once before anyone sits out twice.
  const byes = oddFruits.map((i) => t.stats.get(i.id).byes);
  assert.deepStrictEqual(byes.slice().sort(), [1, 1, 1, 1, 1, 1, 1]);
});

test("even fields never award a bye", async () => {
  const t = Core.createTournament(fruits, { rng: makeRng(6) });
  await playChecked(t, 5, randomDecider(makeRng(6)), "even");
  assert.strictEqual(t.byesAwarded, 0);
});

test("the smallest possible tournament still runs", async () => {
  const t = Core.createTournament(twoFruits, { rng: makeRng(3) });
  await playChecked(t, 3, perfectDecider(indexRanker(twoFruits)), "n=2");
  assert.strictEqual(t.comparisons, 3);
  assert.strictEqual(Core.computeRanking(t)[0].id, twoFruits[0].id);
});

test("pairing avoids rematches while fresh opponents remain", async () => {
  // 8 items, round 2: winners have only faced losers and vice versa, so a
  // rematch here would mean the avoidance logic is not running at all.
  const t = Core.createTournament(fruits, { rng: makeRng(11) });
  const decide = randomDecider(makeRng(12));
  await Core.playRound(t, decide);
  const facedAfterRound1 = new Map(
    fruits.map((i) => [i.id, new Set(t.stats.get(i.id).opponents)])
  );
  await Core.playRound(t, decide, {
    onRoundStart: (_t, pairs) => {
      for (const [a, b] of pairs) {
        assert.ok(
          !facedAfterRound1.get(a.id).has(b.id),
          `round 2 rematched ${a.id} vs ${b.id}`
        );
      }
    },
  });
});

test("rematches stay rare over a long run", async () => {
  const items = makeItems(64);
  const t = Core.createTournament(items, { rng: makeRng(20) });
  const decide = randomDecider(makeRng(21));
  let rematches = 0;
  const faced = new Map(items.map((i) => [i.id, new Set()]));
  for (let r = 0; r < 6; r++) {
    await Core.playRound(t, decide, {
      onRoundStart: (_t, pairs) => {
        for (const [a, b] of pairs) {
          if (faced.get(a.id).has(b.id)) rematches++;
          faced.get(a.id).add(b.id);
          faced.get(b.id).add(a.id);
        }
      },
    });
  }
  const rate = rematches / t.comparisons;
  assert.ok(rate < 0.1, `rematch rate ${(rate * 100).toFixed(1)}% is too high`);
});

test("comparisonsPerRound matches what the pairing actually schedules", async () => {
  for (const n of [2, 3, 8, 71]) {
    const t = Core.createTournament(makeItems(n), { rng: makeRng(n) });
    const expected = Core.comparisonsPerRound(t);
    await Core.playRound(t, randomDecider(makeRng(n)), {
      onRoundStart: (_t, pairs) => assert.strictEqual(pairs.length, expected, `n=${n}`),
    });
    assert.strictEqual(t.comparisons, expected);
  }
});

test("the real 71-album run satisfies conservation", () => {
  // Production output from chrisglein.com/album-ranker: 71 albums, 5 rounds.
  // Odd field, so each round is 35 comparisons plus 1 bye = 36 wins awarded.
  assert.strictEqual(albumExport.length, albums.length);
  const totalWins = albumExport.reduce((sum, e) => sum + e.wins, 0);
  const perRound = Math.floor(albums.length / 2) + (albums.length % 2);
  assert.strictEqual(perRound, 36);
  assert.strictEqual(totalWins, 180);
  assert.strictEqual(totalWins, 5 * perRound);
});

test("the real export is internally consistent", () => {
  let lastWins = Infinity;
  let lastTier = 0;
  albumExport.forEach((e, i) => {
    assert.strictEqual(e.rank, i + 1, `rank at index ${i}`);
    assert.ok(e.tier >= lastTier, `tier went backwards at rank ${e.rank}`);
    assert.ok(e.wins <= lastWins, `wins went up at rank ${e.rank}`);
    lastTier = e.tier;
    lastWins = e.wins;
  });
  const ids = new Set(albumExport.map((e) => e.id));
  assert.strictEqual(ids.size, albumExport.length, "duplicate id in export");
  for (const album of albums) {
    assert.ok(ids.has(album.id), `export is missing ${album.id}`);
  }
});

test("real album data survives a full tournament", async () => {
  const t = Core.createTournament(albums, { rng: makeRng(1996) });
  await playChecked(t, 5, randomDecider(makeRng(1997)), "albums");
  assert.strictEqual(t.comparisons, 5 * 35);
  assert.strictEqual(t.byesAwarded, 5);
  // Duplicate titles must stay distinct: both "Continuum" entries survive.
  const ranked = Core.computeRanking(t);
  const continuums = ranked.filter((i) => i.title === "Continuum");
  assert.strictEqual(continuums.length, 2);
});
