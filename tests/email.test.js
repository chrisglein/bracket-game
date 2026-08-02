"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  Core,
  makeRng,
  randomDecider,
  playChecked,
} = require("./helpers.js");

const { fruits, makeItems } = require("./fixtures/fruits.js");
const { albums, albumJsonFields } = require("./fixtures/albums.js");
const albumExport = require("./fixtures/albums-export.json");

test("the body groups items under win-count headings", async () => {
  const t = Core.createTournament(fruits, { rng: makeRng(80) });
  await playChecked(t, 3, randomDecider(makeRng(81)), "email");
  const { subject, body } = Core.buildEmailContent(Core.buildJson(t), { noun: "fruit" });

  assert.strictEqual(subject, "My fruit ranking");
  const headings = body.split("\n").filter((l) => l.startsWith("## "));
  assert.deepStrictEqual(headings, [...new Set(headings)], "duplicate heading");
  for (const heading of headings) {
    assert.match(heading, /^## \d+ Wins?$/);
  }
  for (const fruit of fruits) {
    assert.ok(body.includes(fruit.title), `${fruit.title} missing from body`);
  }
});

test("singular and plural win headings both read correctly", () => {
  const { body } = Core.buildEmailContent([
    { title: "A", wins: 2, tier: 1 },
    { title: "B", wins: 1, tier: 2 },
    { title: "C", wins: 0, tier: 3 },
  ], { noun: "thing" });
  assert.ok(body.includes("## 2 Wins"));
  assert.ok(body.includes("## 1 Win\n"));
  assert.ok(body.includes("## 0 Wins"));
});

test("eliminated items get their own heading, not a win tier", async () => {
  const t = Core.createTournament(makeItems(24), { rng: makeRng(82) });
  await playChecked(t, 3, randomDecider(makeRng(83)), "email elim");
  Core.eliminate(t, Core.eliminationCandidates(t));

  const { body } = Core.buildEmailContent(Core.buildJson(t), { noun: "item" });
  assert.ok(body.includes("## Eliminated"), "eliminated items were not labelled");

  // The label appears once, at the end, and covers every eliminated item.
  const lines = body.split("\n");
  const at = lines.indexOf("## Eliminated");
  assert.strictEqual(lines.lastIndexOf("## Eliminated"), at);
  for (const item of t.eliminated) {
    assert.ok(lines.indexOf(item.title) > at, `${item.title} listed above the label`);
  }
});

test("a ranking over the cap truncates cleanly instead of mid-item", () => {
  // Driven by an explicit small cap: real lists rarely reach the 4000 default,
  // so relying on one to trip the branch would leave it untested.
  const { subject, body } = Core.buildEmailContent(albumExport, { noun: "album", maxLength: 600 });
  assert.ok(body.endsWith("(truncated, use Copy JSON for the full ranking)"));

  const titles = new Set(albumExport.map((e) => e.title));
  const lines = body.split("\n").filter((l) => l && !l.startsWith("## ") && !l.startsWith("("));
  for (const line of lines) {
    assert.ok(titles.has(line), `"${line}" was cut mid-item`);
  }

  // Truncation keeps the top of the ranking, which is the point of the email.
  assert.ok(body.includes(albumExport[0].title));
  const encoded = encodeURIComponent(body).length + subject.length + 30;
  assert.ok(encoded <= 600, `encoded length ${encoded} exceeds the cap`);
});

test("a real 71-item ranking fits in a mailto without truncation", () => {
  const { subject, body } = Core.buildEmailContent(albumExport, { noun: "album" });
  const encoded = encodeURIComponent(body).length + subject.length + 30;
  assert.ok(encoded < 4000, `encoded length ${encoded} unexpectedly hit the cap`);
  assert.ok(!body.includes("truncated"));
  for (const e of albumExport) {
    assert.ok(body.includes(e.title), `${e.title} missing from body`);
  }
});

test("a short ranking is not truncated", async () => {
  const t = Core.createTournament(fruits, { rng: makeRng(84) });
  await playChecked(t, 3, randomDecider(makeRng(85)), "short");
  const { body } = Core.buildEmailContent(Core.buildJson(t), { noun: "fruit" });
  assert.ok(!body.includes("truncated"));
  assert.strictEqual(body.split("\n").filter((l) => !l.startsWith("## ") && l).length, 8);
});

test("real album data produces a usable email body", async () => {
  const t = Core.createTournament(albums, { rng: makeRng(86) });
  await playChecked(t, 5, randomDecider(makeRng(87)), "albums email");
  const json = Core.buildJson(t, { jsonFields: albumJsonFields });
  const { subject, body } = Core.buildEmailContent(json, { noun: "album" });

  assert.strictEqual(subject, "My album ranking");
  assert.ok(body.startsWith("## "), "body should open with a tier heading");
  assert.ok(body.length > 0);
});
