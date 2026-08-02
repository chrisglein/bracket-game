# Bracket Trimming — Design Notes

## Problem

A Swiss-system tournament works best when every item participates in every round.
But once you are a few rounds in, some items have zero wins and no realistic path to
the top tiers.  Continuing to match them wastes comparisons and dilutes the focus on
contenders the user actually cares about.

---

## What the feature does

After round 3 or later, if there are any items with **0 wins**, the end-of-round
results screen surfaces a **"Trim the Bracket?"** panel.  The panel lists those items
and offers two buttons:

- **Eliminate** — removes them from future rounds; they appear in a collapsed
  "Eliminated" section at the bottom of the final ranking.
- **Keep All** — dismisses the panel; nothing changes.

This prompt can appear multiple times as subsequent rounds produce new zero-win items
(or if earlier zero-win items were kept and remain at zero after another round).

---

## Design decisions and tradeoffs

### 1. When to first offer elimination

**Choice:** Round 3 minimum.

**Rationale:** After round 1, roughly half the field has 0 wins — that is the
normal Swiss distribution, not a sign of poor performance.  After round 2, a quarter
of the field is still at 0.  By round 3, an item with 0 wins has lost every
opportunity to demonstrate quality; in a 64-item tournament the theoretical max wins
it can reach by the end is much less than the current top items.

**Tradeoff:** Waiting longer (e.g. round 5) is more conservative and fairer to items
that may have faced an unusually strong bracket early on.  Starting earlier (round 2)
saves more comparisons but risks pruning items that simply got unlucky matchups.
Round 3 is the middle ground the issue specifically calls out.

### 2. Which items to suggest

**Choice:** Only items with exactly **0 wins** (excluding bye wins).

**Alternatives considered:**

| Criterion | Pros | Cons |
|-----------|------|------|
| 0 wins | Clear, easy to explain | Might miss 1-win persistent losers in later rounds |
| Bottom N% | Adapts to field size | Arbitrary cutoff; users may not understand the math |
| Max-possible < current leader | Most theoretically correct | Complex explanation, hard to communicate in UI |
| Wins < currentRound − k | Continuous pruning | The threshold `k` is arbitrary and confusing |

Zero wins is the most defensible criterion because it requires no arbitrary threshold
and is immediately understandable to the user ("these items have never won a comparison").

### 3. Safety minimum

**Choice:** Never suggest elimination if it would leave fewer than **2 items** in the
active pool.

**Rationale:** At least 2 items are required to form a matchup.  This edge case is
theoretically possible with very small item lists.

### 4. User control vs. automation

**Choice:** Always prompt; never eliminate automatically.

**Rationale:** The ranking is driven by the user's subjective preferences.  An item
with 0 wins may still hold personal significance to the user, and silent elimination
would feel like the app is making decisions on their behalf.  The prompt is low-cost
(two clicks to dismiss) and high-trust.

**Alternative:** An opt-in config flag (`autoEliminate: true`) could skip the prompt
for power users, but this adds API surface without a clear demand.

### 5. What happens to eliminated items

**Choice:** Eliminated items are:
- Removed from future pairings (they reduce the per-round comparison count).
- Still displayed in a collapsed **"Eliminated"** section below the active tier list,
  showing their final win count.
- Included in the **JSON / email export** with an `eliminated: true` flag so the
  complete picture is preserved.

**Alternatives:**

| Option | Pros | Cons |
|--------|------|------|
| Completely hide eliminated items | Cleaner output | Loses the full history; user may wonder where items went |
| Show inline with a strikethrough | Keeps everything in one list | Clutters the tier display; harder to focus on winners |
| Collapsed section at bottom | Clean primary view, full info available | Slight scroll to see eliminated items |

The collapsed section strikes the best balance: the primary ranking stays uncluttered
while the eliminated items remain auditable.

### 6. Impact on ranking quality

Eliminating zero-win items after round 3 has minimal effect on the accuracy of the
**top tiers** — those items have not faced any of the winners and would not have
contributed meaningful Buchholz signal to the top-ranked items.

The **bottom tiers** become less granular: eliminated items are not ranked relative to
each other.  If precise bottom-tier ordering matters, the user should skip elimination.
This tradeoff is explained in the UI via the hint text.

### 7. Repeatability

The check runs every time the results screen is shown.  If a user skips elimination
after round 3, the prompt reappears after round 4 (possibly with the same or fewer
candidates, since some may have won a matchup).  This is intentional — the user
retains full control every round.

---

## Open questions / possible future improvements

- **Win-rate threshold** — extend the criterion to items with `wins < currentRound − k`
  for some configurable `k`, allowing mid-bracket trimming of persistent under-performers
  who are not strictly at 0 wins.
- **Configurable trigger round** — expose a `eliminationRound` config field so
  different use cases (e.g. a 10-item tournament) can tune when trimming starts.
- **Preview mode** — show which matchups would be saved before committing, so the user
  can weigh the accuracy cost explicitly.
- **Undo** — allow un-eliminating an item if the user changes their mind before the
  next round starts.
