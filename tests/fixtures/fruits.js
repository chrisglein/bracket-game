// Small synthetic fixture: 8 fruits, in deliberate quality order.
//
// Index order IS the ground truth — fruits[0] is "best", fruits[7] is "worst".
// Tests use that to build deciders that play perfectly (or with known noise)
// so ranking quality can be asserted instead of guessed at.
//
// 8 is a power of two, so every round pairs cleanly with no bye. Use
// oddFruits for the bye paths.
const fruits = [
  { id: "mango", title: "Mango", color: "orange", season: "summer" },
  { id: "strawberry", title: "Strawberry", color: "red", season: "spring" },
  { id: "peach", title: "Peach", color: "orange", season: "summer" },
  { id: "blueberry", title: "Blueberry", color: "blue", season: "summer" },
  { id: "apple", title: "Apple", color: "red", season: "fall" },
  { id: "banana", title: "Banana", color: "yellow", season: "all" },
  { id: "cantaloupe", title: "Cantaloupe", color: "orange", season: "summer" },
  { id: "grapefruit", title: "Grapefruit", color: "pink", season: "winter" },
];

// Odd count (7) to exercise byes.
const oddFruits = fruits.slice(0, 7);

// Smallest tournament that can run at all.
const twoFruits = fruits.slice(0, 2);

// Generates an arbitrarily sized ground-truth-ordered set for size sweeps.
function makeItems(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `item-${i}`,
    title: `Item ${i}`,
    trueRank: i,
  }));
}

module.exports = { fruits, oddFruits, twoFruits, makeItems };
