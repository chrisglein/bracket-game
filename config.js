// Example config for the bracket engine — albums.
//
// This describes how to label and render the items in items.js. Swap this file
// (and items.js / art-cache.js) to retarget the ranker at a different media
// type. Every function receives one item and returns plain data — the engine
// escapes all text before inserting it into the page.
//
// See bracket.js for the full config contract.
window.BRACKET = {
  noun: "album",
  nounPlural: "albums",
  prompt: "Which do you prefer?",
  intro: "Pick the album you prefer in each matchup. Albums land in tiers by wins.",
  recommendedRounds: 5,
  maxRounds: 8,

  // Extra lines shown under the title on each matchup card.
  cardLines: (item) => [
    { text: item.artist, className: "sub" },
    { text: item.year, className: "meta" },
  ],

  // No external link for albums.
  link: () => null,

  // Suffix after the title in the standings + final results lists.
  listLine: (item) => `${item.artist}${item.year ? ` (${item.year})` : ""}`,

  // Extra fields (besides rank/tier/id/title/wins) to include in JSON export.
  jsonFields: ["artist", "year"],
};
