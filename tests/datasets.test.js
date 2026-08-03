"use strict";

// Tests for the data set picker: the UI layer's rule that a ranker with one
// item set behaves exactly as it always has, and a ranker with several opens on
// a picker whose sets never bleed into each other.

const test = require("node:test");
const assert = require("node:assert");

const {
  loadBracketUi,
  createStorage,
  engineElementIds,
  markupElementIds,
} = require("./fake-dom.js");

const SET_A = Array.from({ length: 6 }, (_, i) => ({ id: `a-${i}`, title: `Alpha ${i}` }));
const SET_B = Array.from({ length: 4 }, (_, i) => ({ id: `b-${i}`, title: `Beta ${i}` }));
const ART_A = Object.fromEntries(SET_A.map((item) => [item.id, `https://art.test/alpha/${item.id}.png`]));
const ART_B = Object.fromEntries(SET_B.map((item) => [item.id, `https://art.test/beta/${item.id}.png`]));

function twoSetConfig(extra) {
  return {
    noun: "game",
    nounPlural: "games",
    storageKey: "demo",
    datasets: [
      { id: "alpha", label: "Alpha Set", blurb: "First shelf.", items: SET_A, art: ART_A },
      { id: "beta", label: "Beta Set", items: SET_B, art: ART_B },
    ],
    ...extra,
  };
}

function cardTitles(ui) {
  return [ui.html("card-a"), ui.html("card-b")];
}

// Lets the choose() promise chain settle after a matchup click.
function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("the markup defines every element the engine looks up", () => {
  const missing = engineElementIds().filter((id) => !markupElementIds().includes(id));
  assert.deepStrictEqual(missing, [], `index.html is missing element ids: ${missing.join(", ")}`);
});

test("a ranker with no datasets never shows the picker", () => {
  const ui = loadBracketUi({ items: SET_A, art: ART_A, config: { storageKey: "demo" } });

  assert.ok(ui.isHidden("dataset-section"), "picker should stay hidden");
  assert.ok(!ui.isHidden("setup-section"), "setup should be visible");
  assert.ok(ui.isHidden("change-dataset"), "there is no other set to change to");
  assert.strictEqual(ui.text("item-count"), "6");
  assert.strictEqual(ui.text("setup-heading"), "Setup");
});

test("a single-set ranker keeps its original storage key", () => {
  const ui = loadBracketUi({ items: SET_A, config: { storageKey: "demo" } });
  ui.click("start-btn");
  assert.deepStrictEqual(ui.storage.keys(), ["bracket-state-v2:demo"]);
});

test("one configured dataset behaves like no datasets", () => {
  const ui = loadBracketUi({
    config: {
      storageKey: "demo",
      datasets: [{ id: "alpha", label: "Alpha Set", items: SET_A, art: ART_A }],
    },
  });

  assert.ok(ui.isHidden("dataset-section"), "one set is not a choice");
  assert.ok(!ui.isHidden("setup-section"));
  assert.ok(ui.isHidden("change-dataset"));
  assert.strictEqual(ui.text("item-count"), "6");
});

test("an empty dataset is ignored rather than offered", () => {
  const ui = loadBracketUi({
    config: {
      storageKey: "demo",
      datasets: [
        { id: "alpha", label: "Alpha Set", items: SET_A },
        { id: "empty", label: "Empty Set", items: [] },
      ],
    },
  });

  assert.ok(ui.isHidden("dataset-section"), "only one usable set, so no picker");
  assert.strictEqual(ui.text("item-count"), "6");
});

test("several datasets open on the picker instead of Setup", () => {
  const ui = loadBracketUi({ config: twoSetConfig() });

  assert.ok(!ui.isHidden("dataset-section"), "picker should be visible");
  assert.ok(ui.isHidden("setup-section"), "setup waits until a set is chosen");

  const cards = ui.datasetCards();
  assert.deepStrictEqual(cards.map((c) => c.dataset.id), ["alpha", "beta"]);

  const [alpha, beta] = ui.datasetCardHtml();
  assert.match(alpha, /Alpha Set/);
  assert.match(alpha, /6 games/);
  assert.match(alpha, /First shelf\./);
  assert.match(beta, /Beta Set/);
  assert.match(beta, /4 games/);
});

test("each teaser only shows art from its own set", () => {
  const ui = loadBracketUi({ config: twoSetConfig() });
  const [alpha, beta] = ui.datasetCardHtml();

  assert.match(alpha, /art\.test\/alpha\//);
  assert.ok(!/art\.test\/beta\//.test(alpha), "alpha teaser leaked beta art");
  assert.match(beta, /art\.test\/beta\//);
  assert.ok(!/art\.test\/alpha\//.test(beta), "beta teaser leaked alpha art");
});

test("choosing a set loads only that set", () => {
  const ui = loadBracketUi({ config: twoSetConfig() });
  ui.click(ui.datasetCards()[1]);

  assert.ok(ui.isHidden("dataset-section"));
  assert.ok(!ui.isHidden("setup-section"));
  assert.ok(!ui.isHidden("change-dataset"), "the way back to the picker should appear");
  assert.strictEqual(ui.text("setup-heading"), "Beta Set");
  assert.strictEqual(ui.text("item-count"), "4");

  ui.click("start-btn");
  for (const html of cardTitles(ui)) {
    assert.match(html, /Beta \d/, "matchup drew from the wrong set");
  }
});

test("choosing a different set swaps the loaded items", () => {
  const ui = loadBracketUi({ config: twoSetConfig() });
  ui.click(ui.datasetCards()[0]);
  assert.strictEqual(ui.text("item-count"), "6");

  ui.click("change-dataset");
  assert.ok(!ui.isHidden("dataset-section"), "the picker should come back");
  assert.ok(ui.isHidden("setup-section"));

  ui.click(ui.datasetCards()[1]);
  assert.strictEqual(ui.text("item-count"), "4");
  assert.strictEqual(ui.text("setup-heading"), "Beta Set");
});

test("each set gets its own saved-progress slot", () => {
  const storage = createStorage();

  const first = loadBracketUi({ config: twoSetConfig(), storage });
  first.click(first.datasetCards()[0]);
  first.click("start-btn");

  const second = loadBracketUi({ config: twoSetConfig(), storage });
  second.click(second.datasetCards()[1]);
  second.click("start-btn");

  assert.deepStrictEqual(storage.keys(), [
    "bracket-state-v2:demo:alpha",
    "bracket-state-v2:demo:beta",
  ]);

  const alpha = JSON.parse(storage.getItem("bracket-state-v2:demo:alpha"));
  const beta = JSON.parse(storage.getItem("bracket-state-v2:demo:beta"));
  assert.match(alpha.itemFingerprint, /Alpha 0/);
  assert.ok(!/Beta 0/.test(alpha.itemFingerprint), "alpha slot holds beta items");
  assert.match(beta.itemFingerprint, /Beta 0/);
  assert.ok(!/Alpha 0/.test(beta.itemFingerprint), "beta slot holds alpha items");
});

test("the picker flags only the set that has progress", () => {
  const storage = createStorage();
  const started = loadBracketUi({ config: twoSetConfig(), storage });
  started.click(started.datasetCards()[1]);
  started.click("start-btn");

  const reopened = loadBracketUi({ config: twoSetConfig(), storage });
  const [alpha, beta] = reopened.datasetCardHtml();
  assert.ok(!/In progress/.test(alpha), "alpha has no saved progress to advertise");
  assert.match(beta, /In progress · round 1/);
});

test("a set in progress resumes when picked, and its neighbour does not", async () => {
  const storage = createStorage();
  const started = loadBracketUi({ config: twoSetConfig(), storage });
  started.click(started.datasetCards()[1]);
  started.click("start-btn");
  started.el("card-a").dispatch("click");
  await flush();

  const resumed = loadBracketUi({ config: twoSetConfig(), storage });
  resumed.click(resumed.datasetCards()[1]);
  assert.ok(!resumed.isHidden("progress-section"), "beta should pick up where it left off");
  assert.match(resumed.text("progress-text"), /1 comparison/);

  const untouched = loadBracketUi({ config: twoSetConfig(), storage });
  untouched.click(untouched.datasetCards()[0]);
  assert.ok(untouched.isHidden("progress-section"), "alpha must not inherit beta's session");
  assert.ok(!untouched.isHidden("setup-section"));
});

test("rounds recommended follow the chosen set's size", () => {
  const config = twoSetConfig();
  config.datasets[0].recommendedRounds = 3;
  const ui = loadBracketUi({ config });

  ui.click(ui.datasetCards()[0]);
  assert.match(ui.text("comparison-estimate"), /3 rounds recommended/);

  ui.click("change-dataset");
  ui.click(ui.datasetCards()[1]);
  assert.match(ui.text("comparison-estimate"), /2 rounds recommended/);
});
