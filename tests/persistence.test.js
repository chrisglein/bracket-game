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

// Storage hands back plain JSON, so every restore here is fed the same way.
function throughJson(value) {
  return JSON.parse(JSON.stringify(value));
}

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

  const wrongItemCount = Core.snapshotTournament(t);
  wrongItemCount.eliminatedIds = [wrongItemCount.activeIds[0]];
  assert.strictEqual(Core.restoreTournament(fruits, wrongItemCount), null);

  const badOpponent = Core.snapshotTournament(t);
  badOpponent.stats[fruits[0].id].opponents = [fruits[0].id];
  assert.strictEqual(Core.restoreTournament(fruits, badOpponent), null);
});

test("restore rejects snapshots that are not usable objects", () => {
  for (const bad of [null, undefined, "snapshot", 42]) {
    assert.strictEqual(Core.restoreTournament(fruits, bad), null, `accepted ${String(bad)}`);
  }

  const t = Core.createTournament(fruits, { rng: makeRng(100) });
  const noLists = Core.snapshotTournament(t);
  noLists.activeIds = "mango";
  assert.strictEqual(Core.restoreTournament(fruits, noLists), null);

  const noStats = Core.snapshotTournament(t);
  noStats.stats = null;
  assert.strictEqual(Core.restoreTournament(fruits, noStats), null);
});

test("restore rejects ids the item list does not contain", () => {
  const t = Core.createTournament(fruits, { rng: makeRng(101) });

  const unknownItem = Core.snapshotTournament(t);
  unknownItem.activeIds = unknownItem.activeIds.slice(0, -1).concat("durian");
  assert.strictEqual(Core.restoreTournament(fruits, unknownItem), null);

  const unknownOpponent = Core.snapshotTournament(t);
  unknownOpponent.stats[fruits[0].id].opponents = ["durian"];
  assert.strictEqual(Core.restoreTournament(fruits, unknownOpponent), null);
});

// The rejection above catches a mismatched item count. An item duplicated
// across the two pools keeps the count right, so it needs its own check.
test("restore rejects an item that appears in both pools", () => {
  const t = Core.createTournament(fruits, { rng: makeRng(102) });
  const duplicate = Core.snapshotTournament(t);
  duplicate.eliminatedIds = [duplicate.activeIds[0]];
  duplicate.activeIds = duplicate.activeIds.slice(1);
  assert.strictEqual(duplicate.activeIds.length + duplicate.eliminatedIds.length, fruits.length);

  duplicate.activeIds[0] = duplicate.eliminatedIds[0];
  assert.strictEqual(Core.restoreTournament(fruits, duplicate), null);
});

// Ids are matched as strings but handed back in their original type, so a
// numeric-id ranker must still find its own stats after a reload.
test("numeric ids survive a snapshot roundtrip", async () => {
  const numeric = [
    { id: 1, title: "One" },
    { id: 2, title: "Two" },
    { id: 3, title: "Three" },
    { id: 4, title: "Four" },
  ];
  const t = Core.createTournament(numeric, { rng: makeRng(103) });
  await playChecked(t, 2, randomDecider(makeRng(104)), "numeric ids");

  const restored = Core.restoreTournament(numeric, throughJson(Core.snapshotTournament(t)));
  assert.ok(restored, "restore should succeed");
  assert.strictEqual(typeof restored.active[0].id, "number", "id type changed");
  assert.deepStrictEqual(Core.buildJson(restored), Core.buildJson(t));
  assertInvariants(restored, "numeric ids restored");
});

// --- Session envelope ---
// A session is what a host actually persists: the snapshot plus the in-round
// cursor. Everything below goes through JSON, the way storage would.

// Stops midway through round 1, the state a reload is most likely to catch.
function interruptedSession(items, seed) {
  const t = Core.createTournament(items, { rng: makeRng(seed) });
  const { pairs } = Core.startRound(t);
  const roundHistory = [{ round: t.round, comparisons: [] }];

  for (let i = 0; i < 2; i++) {
    const [winner, loser] = pairs[i];
    Core.recordResult(t, winner, loser);
    roundHistory[0].comparisons.push({ n: t.comparisons, winnerId: winner.id, loserId: loser.id });
  }

  return {
    t,
    pairs,
    session: {
      view: "matchup",
      roundMatchups: pairs.length,
      roundMatchupsDone: 2,
      currentPairIndex: 2,
      currentPairs: pairs,
      roundHistory,
      eliminationPromptVisible: false,
      keptIds: [],
    },
  };
}

test("a session roundtrip preserves the cursor, pairings, and log", () => {
  const { t, pairs, session } = interruptedSession(fruits, 110);

  const restored = Core.restoreSession(fruits, throughJson(Core.snapshotSession(t, session)));
  assert.ok(restored, "restore should succeed");
  assert.strictEqual(restored.view, "matchup");
  assert.strictEqual(restored.currentPairIndex, 2);
  assert.strictEqual(restored.roundMatchups, pairs.length);
  assert.strictEqual(restored.roundMatchupsDone, 2);
  assert.deepStrictEqual(
    restored.currentPairs.map(([a, b]) => [a.id, b.id]),
    pairs.map(([a, b]) => [a.id, b.id])
  );
  assert.strictEqual(restored.roundHistory[0].comparisons.length, 2);
  assert.strictEqual(restored.tournament.comparisons, t.comparisons);
});

test("an imported ranking can be saved and restored as a session", async () => {
  const items = makeItems(17);
  const t = Core.createTournament(items, { rng: makeRng(117) });
  await playChecked(t, 3, randomDecider(makeRng(118)), "imported session seed");
  Core.eliminate(t, Core.eliminationCandidates(t));

  const imported = Core.importRanking(JSON.stringify(Core.buildJson(t)), items, {
    noun: "item",
    nounPlural: "items",
    maxRounds: items.length - 1,
  });
  const session = {
    view: "results",
    roundMatchups: 0,
    roundMatchupsDone: 0,
    currentPairIndex: 0,
    currentPairs: [],
    roundHistory: [],
    eliminationPromptVisible: false,
    keptIds: [],
  };

  const restored = Core.restoreSession(items, throughJson(Core.snapshotSession(imported.tournament, session)));
  assert.ok(restored, "restore should succeed");
  assert.strictEqual(restored.view, "results");
  assert.deepStrictEqual(restored.tournament.active.map((item) => item.id), imported.tournament.active.map((item) => item.id));
  assert.deepStrictEqual(
    restored.tournament.eliminated.map((item) => item.id),
    imported.tournament.eliminated.map((item) => item.id)
  );
  assert.deepStrictEqual(Core.buildJson(restored.tournament), Core.buildJson(imported.tournament));
});

test("a restored session finishes the round it was interrupted in", () => {
  const { t, pairs, session } = interruptedSession(fruits, 111);

  const restored = Core.restoreSession(fruits, throughJson(Core.snapshotSession(t, session)));
  assert.ok(restored, "restore should succeed");

  for (const [winner, loser] of restored.currentPairs.slice(restored.currentPairIndex)) {
    Core.recordResult(restored.tournament, winner, loser);
  }
  assert.strictEqual(restored.tournament.comparisons, pairs.length);
  assertInvariants(restored.tournament, "resumed round");
});

test("a session played against a different item list is rejected", () => {
  const { t, session } = interruptedSession(fruits, 112);
  const saved = throughJson(Core.snapshotSession(t, session));

  const renamed = fruits.map((f, i) => (i === 0 ? { ...f, title: `${f.title} (2024 remaster)` } : f));
  assert.strictEqual(Core.restoreSession(renamed, saved), null, "a retitled item should invalidate");
  assert.strictEqual(Core.restoreSession(fruits.slice(0, 7), saved), null, "a shorter list should invalidate");
  assert.strictEqual(Core.restoreSession(fruits, null), null);
});

test("a session rejects a cursor that does not fit the round", () => {
  const { t, pairs, session } = interruptedSession(fruits, 113);
  const saved = throughJson(Core.snapshotSession(t, session));

  for (const bad of [pairs.length + 1, -1, 1.5]) {
    assert.strictEqual(
      Core.restoreSession(fruits, { ...saved, currentPairIndex: bad }),
      null,
      `accepted cursor ${bad}`
    );
  }

  // Landing exactly at the end is the finished-round case, not a broken one.
  const atEnd = Core.restoreSession(fruits, { ...saved, currentPairIndex: pairs.length });
  assert.ok(atEnd, "a completed round should still restore");
});

test("a session rejects malformed pairings", () => {
  const { t, session } = interruptedSession(fruits, 114);
  const saved = throughJson(Core.snapshotSession(t, session));

  const cases = [
    [["mango"]],
    [["mango", "durian"]],
    [["mango", "mango"]],
    ["mango"],
  ];
  for (const currentPairs of cases) {
    assert.strictEqual(
      Core.restoreSession(fruits, { ...saved, currentPairs }),
      null,
      `accepted ${JSON.stringify(currentPairs)}`
    );
  }
});

// The log is display-only, so a damaged entry should cost history rather than
// the ranking. A non-numeric index is dropped outright: it is the one field
// that reaches the DOM from storage.
test("a damaged log drops entries but keeps the tournament", () => {
  const { t, session } = interruptedSession(fruits, 115);
  const saved = throughJson(Core.snapshotSession(t, session));
  saved.roundHistory = [
    {
      round: 1,
      comparisons: [
        { n: 1, winnerId: fruits[0].id, loserId: fruits[1].id },
        { n: 2, winnerId: "durian", loserId: fruits[1].id },
        { n: '<img src=x onerror="alert(1)">', winnerId: fruits[0].id, loserId: fruits[1].id },
        { n: 4, winnerId: fruits[2].id, loserId: fruits[2].id },
      ],
    },
    { round: "two", comparisons: [] },
    null,
  ];

  const restored = Core.restoreSession(fruits, saved);
  assert.ok(restored, "a bad log should not lose the tournament");
  assert.strictEqual(restored.roundHistory.length, 1, "non-integer rounds should drop");
  assert.deepStrictEqual(restored.roundHistory[0].comparisons, [
    { n: 1, winnerId: fruits[0].id, loserId: fruits[1].id },
  ]);
});

test("the elimination prompt and kept items survive a reload", () => {
  const items = makeItems(17);
  const t = Core.createTournament(items, { rng: makeRng(116) });
  const session = {
    view: "results",
    roundMatchups: 8,
    roundMatchupsDone: 8,
    currentPairIndex: 0,
    currentPairs: [],
    roundHistory: [],
    eliminationPromptVisible: true,
    keptIds: new Set([items[0].id]),
  };

  const restored = Core.restoreSession(items, throughJson(Core.snapshotSession(t, session)));
  assert.ok(restored, "restore should succeed");
  assert.strictEqual(restored.view, "results");
  assert.strictEqual(restored.eliminationPromptVisible, true);
  assert.deepStrictEqual(restored.keptIds, [String(items[0].id)]);
});
