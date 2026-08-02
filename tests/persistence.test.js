"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  Core,
  makeRng,
  randomDecider,
  playChecked,
  assertInvariants,
} = require("./helpers.js");

const { fruits, makeItems } = require("./fixtures/fruits.js");

test("snapshot and restore preserve ranking state and eliminated ordering", async () => {
  const items = makeItems(17);
  const t = Core.createTournament(items, { rng: makeRng(90) });
  await playChecked(t, 3, randomDecider(makeRng(91)), "persist roundtrip");

  const candidates = Core.eliminationCandidates(t);
  assert.ok(candidates.length > 0, "expected elimination candidates after round 3");
  Core.eliminate(t, candidates.slice(0, 2));

  const restored = Core.restoreTournament(items, Core.snapshotTournament(t), { rng: makeRng(92) });
  assert.ok(restored, "restore should succeed");
  assert.deepStrictEqual(restored.active.map((item) => item.id), t.active.map((item) => item.id));
  assert.deepStrictEqual(
    restored.eliminated.map((item) => item.id),
    t.eliminated.map((item) => item.id)
  );
  assert.strictEqual(restored.round, t.round);
  assert.strictEqual(restored.comparisons, t.comparisons);
  assert.strictEqual(restored.byesAwarded, t.byesAwarded);
  assert.deepStrictEqual(Core.buildJson(restored), Core.buildJson(t));
  assertInvariants(restored, "restored snapshot");
});

test("restored tournaments can keep playing", async () => {
  const items = makeItems(9);
  const t = Core.createTournament(items, { rng: makeRng(93) });
  await playChecked(t, 2, randomDecider(makeRng(94)), "resume seed");

  const restored = Core.restoreTournament(items, Core.snapshotTournament(t), { rng: makeRng(95) });
  assert.ok(restored, "restore should succeed");

  await playChecked(restored, 2, randomDecider(makeRng(96)), "resume continued");
  assertInvariants(restored, "restored continued");
});

test("restore rejects malformed snapshots", async () => {
  const t = Core.createTournament(fruits, { rng: makeRng(97) });
  await playChecked(t, 1, randomDecider(makeRng(98)), "malformed");

  const missingStat = Core.snapshotTournament(t);
  delete missingStat.stats[fruits[0].id];
  assert.strictEqual(Core.restoreTournament(fruits, missingStat), null);

  const duplicateItem = Core.snapshotTournament(t);
  duplicateItem.eliminatedIds = [duplicateItem.activeIds[0]];
  assert.strictEqual(Core.restoreTournament(fruits, duplicateItem), null);

  const badOpponent = Core.snapshotTournament(t);
  badOpponent.stats[fruits[0].id].opponents = [fruits[0].id];
  assert.strictEqual(Core.restoreTournament(fruits, badOpponent), null);
});
