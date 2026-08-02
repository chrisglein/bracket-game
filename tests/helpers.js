"use strict";

const assert = require("node:assert");
const Core = require("../bracket-core.js");

// --- Determinism ---
// mulberry32: small, fast, well-distributed. Any failure is reproducible by
// re-running with the seed printed in the assertion message.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Deciders ---
// A decider stands in for the human clicking a card.

// Plays perfectly against a known ground truth: lower rank value wins.
function perfectDecider(rankOf) {
  return (a, b) => (rankOf(a) <= rankOf(b) ? a : b);
}

// Plays correctly with probability `accuracy`, otherwise upsets. Models a real
// person: broadly consistent, occasionally contradictory.
function noisyDecider(rankOf, accuracy, rng) {
  return (a, b) => {
    const better = rankOf(a) <= rankOf(b) ? a : b;
    const worse = better === a ? b : a;
    return rng() < accuracy ? better : worse;
  };
}

// Ignores quality entirely; useful for shaking out pairing bugs.
function randomDecider(rng) {
  return (a, b) => (rng() < 0.5 ? a : b);
}

// Ground truth for the fruit/makeItems fixtures: position in the source array.
function indexRanker(items) {
  const order = new Map(items.map((it, i) => [it.id, i]));
  return (item) => order.get(item.id);
}

// --- Drivers ---
async function playRounds(t, rounds, decide, hooks) {
  for (let i = 0; i < rounds; i++) {
    await Core.playRound(t, decide, hooks);
  }
  return t;
}

// Plays `rounds` rounds, checking every invariant after each one.
async function playChecked(t, rounds, decide, label) {
  for (let i = 0; i < rounds; i++) {
    await Core.playRound(t, decide);
    assertInvariants(t, `${label} after round ${t.round}`);
  }
  return t;
}

// --- Invariants ---
// These must hold after every round of every tournament, forever. If one of
// these fails the engine has lost or invented data.
function assertInvariants(t, ctx) {
  const where = (msg) => `${ctx}: ${msg}`;

  // 1. Conservation. Every win came from a comparison or a bye, and nothing
  //    was double-counted. This is the single most valuable check here.
  let totalWins = 0;
  for (const s of t.stats.values()) totalWins += s.wins;
  assert.strictEqual(
    totalWins,
    t.comparisons + t.byesAwarded,
    where(`sum(wins)=${totalWins} != comparisons(${t.comparisons}) + byes(${t.byesAwarded})`)
  );

  // 2. Partition. Active and eliminated are disjoint and together account for
  //    every item the tournament started with.
  const activeIds = new Set(t.active.map((i) => i.id));
  const elimIds = new Set(t.eliminated.map((i) => i.id));
  assert.strictEqual(activeIds.size, t.active.length, where("duplicate item in active pool"));
  assert.strictEqual(elimIds.size, t.eliminated.length, where("duplicate item in eliminated pool"));
  for (const id of activeIds) {
    assert.ok(!elimIds.has(id), where(`${id} is both active and eliminated`));
  }
  assert.strictEqual(
    activeIds.size + elimIds.size,
    t.all.length,
    where("active + eliminated != original item count")
  );

  // 3. Stats survive elimination — Buchholz reads through to eliminated
  //    opponents, so dropping an entry would throw.
  for (const item of t.all) {
    assert.ok(t.stats.has(item.id), where(`stats lost ${item.id}`));
  }

  // 4. Opponent symmetry.
  for (const item of t.all) {
    for (const oppId of t.stats.get(item.id).opponents) {
      const back = t.stats.get(oppId).opponents;
      assert.ok(back.includes(item.id), where(`${item.id} faced ${oppId} but not vice versa`));
      assert.notStrictEqual(oppId, item.id, where(`${item.id} was paired with itself`));
    }
  }

  // 5. Bye fairness: nobody gets a second bye while anyone has had zero.
  const byeCounts = t.all.map((i) => t.stats.get(i.id).byes);
  if (Math.max(...byeCounts) > 1) {
    assert.ok(
      Math.min(...byeCounts) >= 1,
      where("an item got a second bye while another had none")
    );
  }

  // 6. Wins can never exceed opportunities.
  for (const item of t.all) {
    const s = t.stats.get(item.id);
    assert.ok(
      s.wins <= s.opponents.length + s.byes,
      where(`${item.id} has more wins than matchups`)
    );
  }
}

// Checks the shape of a round's pairing before any results are recorded.
function assertPairing(t, pairs, byeItem, ctx) {
  const where = (msg) => `${ctx}: ${msg}`;
  const n = t.active.length;

  assert.strictEqual(pairs.length, Math.floor(n / 2), where("wrong number of matchups"));
  assert.strictEqual(byeItem === null, n % 2 === 0, where("bye presence does not match parity"));

  const seen = new Set();
  for (const [a, b] of pairs) {
    assert.notStrictEqual(a.id, b.id, where("item paired with itself"));
    for (const item of [a, b]) {
      assert.ok(!seen.has(item.id), where(`${item.id} appears in two matchups`));
      seen.add(item.id);
    }
  }
  if (byeItem) seen.add(byeItem.id);

  // Every active item plays or sits out — none silently dropped.
  assert.strictEqual(seen.size, n, where("some active items were not scheduled"));
}

// --- Ranking quality ---
// Spearman's rank correlation between produced order and ground truth.
function spearman(producedIds, trueOrderIds) {
  const trueRank = new Map(trueOrderIds.map((id, i) => [id, i]));
  const n = producedIds.length;
  let d2 = 0;
  producedIds.forEach((id, i) => {
    const d = i - trueRank.get(id);
    d2 += d * d;
  });
  return 1 - (6 * d2) / (n * (n * n - 1));
}

module.exports = {
  Core,
  makeRng,
  perfectDecider,
  noisyDecider,
  randomDecider,
  indexRanker,
  playRounds,
  playChecked,
  assertInvariants,
  assertPairing,
  spearman,
};
