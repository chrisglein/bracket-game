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
} = require("./helpers.js");

const { fruits, makeItems } = require("./fixtures/fruits.js");
const { albums, albumJsonFields } = require("./fixtures/albums.js");

function assertRankingShape(json, activeCount) {
  const active = json.filter((e) => !e.eliminated);
  assert.strictEqual(active.length, activeCount);

  let lastWins = Infinity;
  let lastTier = 0;
  active.forEach((e, i) => {
    assert.strictEqual(e.rank, i + 1, `rank must be contiguous from 1 (index ${i})`);
    assert.ok(e.tier >= lastTier, `tier went backwards at rank ${e.rank}`);
    assert.ok(e.wins <= lastWins, `wins went up at rank ${e.rank}`);
    lastTier = e.tier;
    lastWins = e.wins;
  });
}

test("export ranks are contiguous and tiers track win counts", async () => {
  const t = Core.createTournament(fruits, { rng: makeRng(50) });
  await playChecked(t, 4, randomDecider(makeRng(51)), "export");
  assertRankingShape(Core.buildJson(t), 8);
});

test("jsonFields carry through and absent fields are omitted", async () => {
  const t = Core.createTournament(albums, { rng: makeRng(52) });
  await playChecked(t, 3, randomDecider(makeRng(53)), "fields");
  const json = Core.buildJson(t, { jsonFields: albumJsonFields });

  for (const entry of json) {
    assert.ok("artist" in entry, `${entry.id} lost its artist`);
    assert.ok("year" in entry, `${entry.id} lost its year`);
  }
  // year: null is a real value in this data and must survive as null.
  const laurel = json.find((e) => e.id === "laurel");
  assert.strictEqual(laurel.year, null);

  const noFields = Core.buildJson(t);
  assert.ok(!("artist" in noFields[0]), "fields leaked in without jsonFields");
});

test("export matches the shape of real production output", async () => {
  const t = Core.createTournament(albums, { rng: makeRng(54) });
  await playChecked(t, 5, randomDecider(makeRng(55)), "shape");
  const json = Core.buildJson(t, { jsonFields: albumJsonFields });

  assert.deepStrictEqual(
    Object.keys(json[0]).sort(),
    ["artist", "id", "rank", "tier", "title", "wins", "year"]
  );
  assertRankingShape(json, albums.length);
});

test("eliminated items are appended, flagged, and unranked", async () => {
  const t = Core.createTournament(makeItems(24), { rng: makeRng(56) });
  await playChecked(t, 3, randomDecider(makeRng(57)), "elim export");
  Core.eliminate(t, Core.eliminationCandidates(t));

  const json = Core.buildJson(t);
  const elim = json.filter((e) => e.eliminated);
  assert.strictEqual(elim.length, t.eliminated.length);
  assert.ok(elim.length > 0);

  // They sit at the end, so a reader hitting the first null rank knows the
  // ranked portion is over.
  const firstElimIndex = json.findIndex((e) => e.eliminated);
  assert.ok(json.slice(firstElimIndex).every((e) => e.eliminated));

  for (const e of elim) {
    assert.strictEqual(e.rank, null);
    assert.strictEqual(e.tier, null);
    assert.strictEqual(e.wins, 0);
  }
  assertRankingShape(json, t.active.length);
});

test("every item appears exactly once in the export", async () => {
  const t = Core.createTournament(makeItems(24), { rng: makeRng(58) });
  await playChecked(t, 3, randomDecider(makeRng(59)), "coverage");
  Core.eliminate(t, Core.eliminationCandidates(t));

  const json = Core.buildJson(t);
  assert.strictEqual(json.length, 24);
  assert.strictEqual(new Set(json.map((e) => e.id)).size, 24);
});

test("tiers() and buildJson() agree on numbering", async () => {
  const t = Core.createTournament(albums, { rng: makeRng(60) });
  await playChecked(t, 4, randomDecider(makeRng(61)), "agree");

  const json = Core.buildJson(t);
  const byId = new Map(json.map((e) => [e.id, e]));
  for (const group of Core.tiers(t)) {
    let rank = group.startRank;
    for (const item of group.items) {
      const entry = byId.get(item.id);
      assert.strictEqual(entry.tier, group.tier, `${item.id} tier`);
      assert.strictEqual(entry.rank, rank++, `${item.id} rank`);
      assert.strictEqual(entry.wins, group.wins, `${item.id} wins`);
    }
  }
});

test("a perfectly played tournament puts the true best in tier 1", async () => {
  const t = Core.createTournament(fruits, { rng: makeRng(62) });
  await playChecked(t, 4, perfectDecider(indexRanker(fruits)), "best");
  const json = Core.buildJson(t);
  assert.strictEqual(json[0].id, "mango");
  assert.strictEqual(json[0].tier, 1);
  assert.strictEqual(json[0].rank, 1);
});
