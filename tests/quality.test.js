"use strict";

// Quality tests, not correctness tests. A Swiss bracket is a heuristic, so
// there is no single right answer to assert. Instead these play against a
// known ground truth and check that the ranking it produces is good enough --
// which is what catches a pairing or tiebreak change that quietly makes the
// results worse.

const test = require("node:test");
const assert = require("node:assert");

const {
  Core,
  makeRng,
  perfectDecider,
  noisyDecider,
  indexRanker,
  playRounds,
  spearman,
} = require("./helpers.js");

const { fruits, makeItems } = require("./fixtures/fruits.js");

test("a flawless player never loses and lands alone in tier 1", async () => {
  const items = makeItems(64);
  const rank = indexRanker(items);
  for (let seed = 0; seed < 10; seed++) {
    const t = Core.createTournament(items, { rng: makeRng(seed) });
    await playRounds(t, 6, perfectDecider(rank));
    const best = t.stats.get("item-0");
    assert.strictEqual(best.opponents.length + best.byes, best.wins, `seed ${seed}`);
    assert.strictEqual(Core.tiers(t)[0].items[0].id, "item-0", `seed ${seed}`);
  }
});

test("perfect play correlates strongly with the true order", async () => {
  const items = makeItems(64);
  const rank = indexRanker(items);
  const trueOrder = items.map((i) => i.id);

  let total = 0;
  for (let seed = 0; seed < 10; seed++) {
    const t = Core.createTournament(items, { rng: makeRng(seed) });
    await playRounds(t, 6, perfectDecider(rank));
    total += spearman(Core.computeRanking(t).map((i) => i.id), trueOrder);
  }
  const mean = total / 10;
  assert.ok(mean > 0.85, `mean Spearman was only ${mean.toFixed(3)}`);
});

test("more rounds produce a better ranking", async () => {
  const items = makeItems(64);
  const rank = indexRanker(items);
  const trueOrder = items.map((i) => i.id);

  const scoreAfter = async (rounds) => {
    let total = 0;
    for (let seed = 0; seed < 8; seed++) {
      const t = Core.createTournament(items, { rng: makeRng(seed) });
      await playRounds(t, rounds, perfectDecider(rank));
      total += spearman(Core.computeRanking(t).map((i) => i.id), trueOrder);
    }
    return total / 8;
  };

  const [three, six] = [await scoreAfter(3), await scoreAfter(6)];
  assert.ok(six > three, `6 rounds (${six.toFixed(3)}) did not beat 3 (${three.toFixed(3)})`);
});

test("an inconsistent player still gets a usable top tier", async () => {
  // 85% accurate: the realistic case, where someone contradicts themselves on
  // close calls but is reliable on lopsided ones.
  const items = makeItems(64);
  const rank = indexRanker(items);
  const TOP_K = 10;
  const trueTop = new Set(items.slice(0, TOP_K).map((i) => i.id));

  let kept = 0;
  const seeds = 20;
  for (let seed = 0; seed < seeds; seed++) {
    const t = Core.createTournament(items, { rng: makeRng(seed) });
    await playRounds(t, 6, noisyDecider(rank, 0.85, makeRng(seed + 500)));
    const top = Core.computeRanking(t).slice(0, TOP_K);
    kept += top.filter((i) => trueTop.has(i.id)).length;
  }

  const recall = kept / (seeds * TOP_K);
  assert.ok(recall > 0.5, `top-${TOP_K} recall was only ${recall.toFixed(2)}`);
});

test("Buchholz separates items inside a tier", async () => {
  // Two items on equal wins should be ordered by strength of opposition, not
  // by whatever order the pool happened to be in.
  const items = makeItems(32);
  const t = Core.createTournament(items, { rng: makeRng(70) });
  await playRounds(t, 5, perfectDecider(indexRanker(items)));

  for (const group of Core.tiers(t)) {
    let last = Infinity;
    for (const item of group.items) {
      const b = t.stats.get(item.id).buchholz;
      assert.ok(b <= last, `tier ${group.tier} is not ordered by Buchholz`);
      last = b;
    }
  }
});

test("even at the round cap, Swiss does not become a round robin", async () => {
  // maxRounds is items-1, which reads like a full round robin but is not:
  // pairing is greedy and falls back to rematches, so items finish having
  // faced fewer than n-1 distinct opponents and genuine ties survive. The UI
  // calls this "as accurate as it gets" -- accurate, but not exact.
  const t = Core.createTournament(fruits, { rng: makeRng(71) });
  await playRounds(t, 7, perfectDecider(indexRanker(fruits)));
  const ranked = Core.computeRanking(t);

  assert.strictEqual(ranked[0].id, "mango", "true best must finish first");
  assert.strictEqual(ranked[ranked.length - 1].id, "grapefruit", "true worst must finish last");

  const corr = spearman(ranked.map((i) => i.id), fruits.map((i) => i.id));
  assert.ok(corr > 0.9, `Spearman was only ${corr.toFixed(3)}`);

  const distinct = fruits.map((i) => new Set(t.stats.get(i.id).opponents).size);
  assert.ok(
    Math.min(...distinct) < fruits.length - 1,
    "expected rematches; if this fails the pairing now achieves a true round robin"
  );
});
