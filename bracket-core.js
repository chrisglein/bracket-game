// Bracket core — the DOM-free ranking engine.
//
// Everything here is pure data transformation: Swiss pairing, win tallying,
// Buchholz, tier grouping, elimination, and JSON export. No `document`, no
// event handling, no rendering. bracket.js owns all of that.
//
// Two seams make the engine testable:
//   rng     — injectable randomness, so a run is reproducible from a seed.
//   decide  — injectable "who wins this matchup", so a tournament can be
//             played by a script instead of by a human clicking cards.
//
// Loaded as a plain <script> in the browser (sets window.BracketCore) and as
// a CommonJS module in tests. Deliberately not an ES module: `type="module"`
// is CORS-blocked over file://, and opening index.html directly from disk is
// a headline feature of this project.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BracketCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Rounds completed before a 0-win item may be offered up for elimination.
  const ELIMINATION_MIN_ROUND = 3;
  // A matchup needs two items, so never trim the pool below this.
  const MIN_ACTIVE_AFTER_ELIMINATION = 2;

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function createTournament(items, options) {
    const opts = options || {};
    const rng = typeof opts.rng === "function" ? opts.rng : Math.random;
    const stats = new Map();
    for (const item of items) {
      stats.set(item.id, { wins: 0, byes: 0, opponents: [], hadBye: false, buchholz: 0 });
    }
    return {
      all: items.slice(),
      active: shuffle(items.slice(), rng),
      eliminated: [],
      stats,
      rng,
      round: 0,
      comparisons: 0,
      byesAwarded: 0,
      eliminationMinRound: opts.eliminationMinRound || ELIMINATION_MIN_ROUND,
      minActiveAfterElimination: opts.minActiveAfterElimination || MIN_ACTIVE_AFTER_ELIMINATION,
    };
  }

  // --- Swiss pairing ---
  // Groups items by win count, shuffles within groups, pairs adjacent items,
  // avoids rematches when possible. Gives a bye to the lowest-ranked item if
  // the count is odd.
  function swissPair(t) {
    const groups = new Map();
    for (const item of t.active) {
      const w = t.stats.get(item.id).wins;
      if (!groups.has(w)) groups.set(w, []);
      groups.get(w).push(item);
    }
    const sorted = [];
    for (const k of [...groups.keys()].sort((a, b) => b - a)) {
      sorted.push(...shuffle([...groups.get(k)], t.rng));
    }

    let byeItem = null;
    if (sorted.length % 2 !== 0) {
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (!t.stats.get(sorted[i].id).hadBye) {
          byeItem = sorted.splice(i, 1)[0];
          break;
        }
      }
      if (!byeItem) byeItem = sorted.pop();
      const s = t.stats.get(byeItem.id);
      s.wins++;
      s.byes++;
      s.hadBye = true;
      t.byesAwarded++;
    }

    const pairs = [];
    const used = new Set();
    for (let i = 0; i < sorted.length; i++) {
      if (used.has(sorted[i].id)) continue;
      const faced = new Set(t.stats.get(sorted[i].id).opponents);
      let bestJ = -1;
      for (let j = i + 1; j < sorted.length; j++) {
        if (used.has(sorted[j].id)) continue;
        if (!faced.has(sorted[j].id)) { bestJ = j; break; }
        if (bestJ === -1) bestJ = j; // fallback: allow rematch
      }
      if (bestJ !== -1) {
        pairs.push([sorted[i], sorted[bestJ]]);
        used.add(sorted[i].id);
        used.add(sorted[bestJ].id);
      }
    }

    return { pairs, byeItem };
  }

  function startRound(t) {
    t.round++;
    return swissPair(t);
  }

  function recordResult(t, winner, loser) {
    t.stats.get(winner.id).wins++;
    t.stats.get(winner.id).opponents.push(loser.id);
    t.stats.get(loser.id).opponents.push(winner.id);
    t.comparisons++;
  }

  // Plays one full round, asking `decide(a, b)` for each matchup. `decide` may
  // return a winner or a promise of one, which is how the browser parks on a
  // click and a test returns instantly.
  async function playRound(t, decide, hooks) {
    const h = hooks || {};
    const { pairs, byeItem } = startRound(t);
    if (h.onRoundStart) h.onRoundStart(t, pairs, byeItem);
    for (const [a, b] of pairs) {
      const winner = await decide(a, b);
      const loser = winner.id === a.id ? b : a;
      recordResult(t, winner, loser);
      if (h.onResult) h.onResult(t, winner, loser);
    }
    if (h.onRoundEnd) h.onRoundEnd(t);
    return t;
  }

  // --- Ranking ---
  function computeRanking(t) {
    for (const item of t.active) {
      const s = t.stats.get(item.id);
      s.buchholz = s.opponents.reduce((sum, oppId) => sum + t.stats.get(oppId).wins, 0);
    }
    return [...t.active].sort((a, b) => {
      const sa = t.stats.get(a.id);
      const sb = t.stats.get(b.id);
      if (sb.wins !== sa.wins) return sb.wins - sa.wins;
      return sb.buchholz - sa.buchholz;
    });
  }

  // Ranked items bucketed by win count. The single source of tier numbering —
  // both the rendered tier list and the JSON export read from this.
  function tiers(t) {
    const ranked = computeRanking(t);
    const groups = new Map();
    for (const item of ranked) {
      const w = t.stats.get(item.id).wins;
      if (!groups.has(w)) groups.set(w, []);
      groups.get(w).push(item);
    }
    const out = [];
    let rank = 1;
    let tierNum = 1;
    for (const w of [...groups.keys()].sort((a, b) => b - a)) {
      const items = groups.get(w);
      out.push({ tier: tierNum, wins: w, startRank: rank, items });
      rank += items.length;
      tierNum++;
    }
    return out;
  }

  function buildJson(t, options) {
    const jsonFields = (options && options.jsonFields) || [];
    const json = [];
    const withExtras = (item, entry) => {
      for (const f of jsonFields) {
        if (item[f] !== undefined) entry[f] = item[f];
      }
      return entry;
    };
    for (const group of tiers(t)) {
      let rank = group.startRank;
      for (const item of group.items) {
        json.push(withExtras(item, {
          rank: rank++,
          tier: group.tier,
          id: item.id,
          title: item.title,
          wins: group.wins,
        }));
      }
    }
    for (const item of t.eliminated) {
      json.push(withExtras(item, {
        rank: null,
        tier: null,
        id: item.id,
        title: item.title,
        wins: t.stats.get(item.id).wins,
        eliminated: true,
      }));
    }
    return json;
  }

  // --- Elimination ---
  function eliminationCandidates(t) {
    if (t.round < t.eliminationMinRound) return [];
    const candidates = t.active.filter((item) => t.stats.get(item.id).wins === 0);
    if (t.active.length - candidates.length < t.minActiveAfterElimination) return [];
    return candidates;
  }

  function eliminate(t, candidates) {
    const ids = new Set(candidates.map((i) => i.id));
    const removed = t.active.filter((i) => ids.has(i.id));
    t.eliminated.push(...removed);
    t.active = t.active.filter((i) => !ids.has(i.id));
    return removed;
  }

  function comparisonsPerRound(t) {
    return Math.floor(t.active.length / 2);
  }

  return {
    ELIMINATION_MIN_ROUND,
    MIN_ACTIVE_AFTER_ELIMINATION,
    shuffle,
    createTournament,
    swissPair,
    startRound,
    recordResult,
    playRound,
    computeRanking,
    tiers,
    buildJson,
    eliminationCandidates,
    eliminate,
    comparisonsPerRound,
  };
});
