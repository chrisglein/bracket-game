// Album Ranker — pairwise merge sort with interactive comparisons.
//
// Approach:
//   - Albums are sorted via merge sort. Every comparison is presented to the user
//     as a "pick A or B" matchup. This produces a complete, correct ordering using
//     ~n*log2(n) comparisons (e.g. ~17 for 8 albums, ~64 for 16, ~296 for 64).
//   - The "current standings" view shows the latest fully-merged run as a sneak
//     peek of how the ranking is shaping up.
//   - When sorting completes, results render and JSON output is shown.

const cardA = document.getElementById("card-a");
const cardB = document.getElementById("card-b");
const matchupSection = document.getElementById("matchup-section");
const resultsSection = document.getElementById("results-section");
const standingsList = document.getElementById("standings");
const finalList = document.getElementById("final-list");
const jsonOutput = document.getElementById("json-output");
const progressText = document.getElementById("progress-text");
const progressFill = document.getElementById("progress-fill");
const copyBtn = document.getElementById("copy-json");
const restartBtn = document.getElementById("restart");

let pendingResolve = null;
let comparisonsDone = 0;
let estimatedTotal = 1;
let latestStandings = [];

function renderMatchup(a, b) {
  cardA.innerHTML = `<div class="title">${a.title}</div><div class="artist">${a.artist}</div><div class="year">${a.year}</div>`;
  cardB.innerHTML = `<div class="title">${b.title}</div><div class="artist">${b.artist}</div><div class="year">${b.year}</div>`;
  cardA.onclick = () => choose(a);
  cardB.onclick = () => choose(b);
}

function choose(album) {
  if (!pendingResolve) return;
  const r = pendingResolve;
  pendingResolve = null;
  comparisonsDone++;
  updateProgress();
  r(album);
}

function pickWinner(a, b) {
  renderMatchup(a, b);
  return new Promise(resolve => { pendingResolve = resolve; });
}

function updateProgress() {
  const pct = Math.min(100, Math.round((comparisonsDone / estimatedTotal) * 100));
  progressFill.style.width = pct + "%";
  progressText.textContent = `${comparisonsDone} of ~${estimatedTotal} comparisons (${pct}%)`;
}

function renderStandings(list) {
  latestStandings = list;
  standingsList.innerHTML = list
    .map(a => `<li><strong>${a.title}</strong> — ${a.artist} (${a.year})</li>`)
    .join("");
}

// Async merge sort. Splits, sorts halves, then merges via user comparisons.
async function mergeSort(items) {
  if (items.length <= 1) return items;
  const mid = Math.floor(items.length / 2);
  const left = await mergeSort(items.slice(0, mid));
  const right = await mergeSort(items.slice(mid));
  return await merge(left, right);
}

async function merge(left, right) {
  const result = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    const winner = await pickWinner(left[i], right[j]);
    if (winner === left[i]) {
      result.push(left[i++]);
    } else {
      result.push(right[j++]);
    }
  }
  while (i < left.length) result.push(left[i++]);
  while (j < right.length) result.push(right[j++]);
  // Show this merged segment as a partial standings preview.
  renderStandings(result);
  return result;
}

// Estimate comparisons for n items via merge sort: ~ceil(n * log2(n)) - n + 1
function estimateComparisons(n) {
  if (n <= 1) return 0;
  return Math.ceil(n * Math.log2(n)) - n + 1;
}

function showFinalResults(ranked) {
  matchupSection.classList.add("hidden");
  resultsSection.classList.remove("hidden");

  finalList.innerHTML = ranked
    .map((a, i) => `<li><strong>${a.title}</strong> — ${a.artist} (${a.year})</li>`)
    .join("");

  const json = ranked.map((a, i) => ({
    rank: i + 1,
    id: a.id,
    title: a.title,
    artist: a.artist,
    year: a.year,
  }));
  jsonOutput.value = JSON.stringify(json, null, 2);
}

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(jsonOutput.value);
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = "Copy JSON"), 1500);
  } catch {
    jsonOutput.select();
    document.execCommand("copy");
  }
});

restartBtn.addEventListener("click", () => location.reload());

// --- Boot ---
async function start() {
  if (!Array.isArray(ALBUMS) || ALBUMS.length === 0) {
    progressText.textContent = "No albums loaded. Edit albums.js to add some.";
    return;
  }
  if (ALBUMS.length === 1) {
    showFinalResults(ALBUMS);
    return;
  }
  // Light shuffle so the first matchups aren't always the same.
  const shuffled = [...ALBUMS].sort(() => Math.random() - 0.5);
  estimatedTotal = estimateComparisons(shuffled.length);
  updateProgress();

  const ranked = await mergeSort(shuffled);
  renderStandings(ranked);
  showFinalResults(ranked);
}

start();
