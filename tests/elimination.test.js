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
} = require("./helpers.js");

const { fruits, makeItems } = require("./fixtures/fruits.js");

// Builds a tournament with hand-set records, so the candidate rules can be
// tested without depending on how a played-out bracket happens to land.
function stubbed(items, records, round) {
  const t = Core.createTournament(items, { rng: makeRng(1) });
  t.round = round;
  for (const [id, rec] of Object.entries(records)) {
    Object.assign(t.stats.get(id), rec);
  }
  return t;
}

test("no elimination is offered before round 3", async () => {
  const t = Core.createTournament(fruits, { rng: makeRng(30) });
  const decide = perfectDecider(indexRanker(fruits));
  for (const round of [1, 2]) {
    await Core.playRound(t, decide);
    assert.strictEqual(t.round, round);
    assert.deepStrictEqual(Core.eliminationCandidates(t), []);
  }
});

test("zero-win items become candidates from round 3", async () => {
  const t = Core.createTournament(fruits, { rng: makeRng(31) });
  await playChecked(t, 3, perfectDecider(indexRanker(fruits)), "elim");
  const candidates = Core.eliminationCandidates(t);
  assert.ok(candidates.length > 0, "expected at least one winless item");
  for (const c of candidates) {
    assert.strictEqual(t.stats.get(c.id).wins, 0);
  }
});

test("the safety floor keeps at least two items in play", () => {
  const items = makeItems(3);
  // Two of three are winless: trimming would leave a single item and no
  // possible matchup, so nothing is offered.
  const t = stubbed(items, {
    "item-0": { wins: 3 },
    "item-1": { wins: 0 },
    "item-2": { wins: 0 },
  }, 3);
  assert.deepStrictEqual(Core.eliminationCandidates(t), []);
});

test("elimination is offered when exactly two items would remain", () => {
  const items = makeItems(4);
  const t = stubbed(items, {
    "item-0": { wins: 3 },
    "item-1": { wins: 2 },
    "item-2": { wins: 0 },
    "item-3": { wins: 0 },
  }, 3);
  assert.deepStrictEqual(
    Core.eliminationCandidates(t).map((i) => i.id).sort(),
    ["item-2", "item-3"]
  );
});

// NOTE: this pins current behavior, which is that a bye counts as a win and
// therefore shields an item that has never actually won a comparison. The UI
// copy says "have never won", which contradicts this. Flip to
// `wins - byes === 0` if that copy is the intent.
test("a bye currently shields an item that never won a comparison", () => {
  const items = makeItems(4);
  const t = stubbed(items, {
    "item-0": { wins: 3 },
    "item-1": { wins: 2 },
    "item-2": { wins: 1, byes: 1, hadBye: true },
    "item-3": { wins: 0 },
  }, 3);
  assert.deepStrictEqual(
    Core.eliminationCandidates(t).map((i) => i.id).sort(),
    ["item-3"]
  );
});

test("eliminating moves items out of the active pool and keeps their stats", async () => {
  const t = Core.createTournament(fruits, { rng: makeRng(32) });
  await playChecked(t, 3, perfectDecider(indexRanker(fruits)), "elim");

  const candidates = Core.eliminationCandidates(t);
  const before = t.active.length;
  Core.eliminate(t, candidates);

  assert.strictEqual(t.active.length, before - candidates.length);
  assert.strictEqual(t.eliminated.length, candidates.length);
  for (const c of candidates) {
    assert.ok(!t.active.some((i) => i.id === c.id));
    assert.ok(t.stats.has(c.id), "stats must survive for Buchholz lookups");
  }
  assertInvariants(t, "after eliminate");
});

test("the tournament keeps running after a trim", async () => {
  const t = Core.createTournament(makeItems(24), { rng: makeRng(33) });
  const decide = randomDecider(makeRng(34));
  await playChecked(t, 3, decide, "pre-trim");

  const candidates = Core.eliminationCandidates(t);
  assert.ok(candidates.length > 0);
  Core.eliminate(t, candidates);

  const perRound = Core.comparisonsPerRound(t);
  await playChecked(t, 3, decide, "post-trim");
  assert.strictEqual(t.comparisons, 3 * 12 + 3 * perRound);
});

test("eliminated items never reappear in a matchup", async () => {
  const t = Core.createTournament(makeItems(24), { rng: makeRng(35) });
  const decide = randomDecider(makeRng(36));
  await playChecked(t, 3, decide, "pre-trim");
  Core.eliminate(t, Core.eliminationCandidates(t));
  const gone = new Set(t.eliminated.map((i) => i.id));

  for (let r = 0; r < 4; r++) {
    await Core.playRound(t, decide, {
      onRoundStart: (_t, pairs, bye) => {
        for (const [a, b] of pairs) {
          assert.ok(!gone.has(a.id) && !gone.has(b.id), "eliminated item was paired");
        }
        if (bye) assert.ok(!gone.has(bye.id), "eliminated item was given a bye");
      },
    });
  }
});

test("eliminating does not disturb surviving items' Buchholz", async () => {
  const t = Core.createTournament(makeItems(24), { rng: makeRng(37) });
  await playChecked(t, 3, randomDecider(makeRng(38)), "buchholz");

  const before = new Map(Core.computeRanking(t).map((i) => [i.id, t.stats.get(i.id).buchholz]));
  Core.eliminate(t, Core.eliminationCandidates(t));
  for (const item of Core.computeRanking(t)) {
    assert.strictEqual(
      t.stats.get(item.id).buchholz,
      before.get(item.id),
      `${item.id} Buchholz shifted when other items were eliminated`
    );
  }
});

test("eliminating twice is a no-op the second time", async () => {
  const t = Core.createTournament(makeItems(24), { rng: makeRng(39) });
  await playChecked(t, 3, randomDecider(makeRng(40)), "double");
  const candidates = Core.eliminationCandidates(t);
  Core.eliminate(t, candidates);
  const size = t.eliminated.length;
  Core.eliminate(t, candidates);
  assert.strictEqual(t.eliminated.length, size, "re-eliminating duplicated entries");
  assertInvariants(t, "double eliminate");
});

// The design doc asserts trimming has "minimal effect on the accuracy of the
// top tiers" without measuring it. This measures it.
test("trimming does not cost the top of the ranking", async () => {
  const items = makeItems(64);
  const rank = indexRanker(items);
  const TOP_K = 10;
  let kept = 0;

  for (let seed = 0; seed < 25; seed++) {
    const withTrim = Core.createTournament(items, { rng: makeRng(seed) });
    await playChecked(withTrim, 3, perfectDecider(rank), `trim seed ${seed}`);
    Core.eliminate(withTrim, Core.eliminationCandidates(withTrim));
    await playChecked(withTrim, 3, perfectDecider(rank), `trim seed ${seed}`);

    const top = Core.computeRanking(withTrim).slice(0, TOP_K).map((i) => i.id);
    const trueTop = new Set(items.slice(0, TOP_K).map((i) => i.id));
    kept += top.filter((id) => trueTop.has(id)).length;

    // A perfectly-played item can never be trimmed: it never loses.
    assert.ok(
      !withTrim.eliminated.some((i) => rank(i) < TOP_K),
      `seed ${seed} eliminated a true top-${TOP_K} item`
    );
  }

  const recall = kept / (25 * TOP_K);
  assert.ok(recall > 0.75, `top-${TOP_K} recall after trimming was only ${recall.toFixed(2)}`);
});
