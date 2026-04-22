# Album Ranking Bracket Web App

## Overview

Build a **single, simple, static web page** that allows a user to rank a list of albums by making **head-to-head choices in a tournament-style bracket**.

This is intended to be a **small local project**, not a production web app. It should run directly from the local file system if possible, using only **HTML, CSS, and vanilla JavaScript**. No backend is required.

The core interaction is:

* The app starts with a list of albums provided in JavaScript/JSON.
* Albums are arranged into a bracket.
* The user repeatedly chooses between two albums in each matchup.
* Winners advance through the winner bracket.
* The app should support a structure that also uses a **loser bracket / placement logic**, so that the result is not just a single winner, but a **sorted ranking of all albums**.
* At the end, the app outputs a **sorted list of albums with final rank** in JSON form, and also displays it clearly in the UI.

## Primary Goal

Create an easy, low-friction way for a person who struggles to rank many items on a 1–4 scale to instead rank them through **pairwise comparisons**.

The app should feel like:

* “Pick which of these two albums you prefer”
* repeated many times
* until a full ordered ranking is produced

## Intended Input Size

* Target input size: **up to 64 albums**
* Assume the input will usually be trimmed to a **power of 2**, ideally 64
* It is acceptable to require the input list to be exactly a power of 2 for the first version
* If there are more than 64 items or a non-power-of-2 item count, that can be treated as out of scope for v1 unless handled with simple preprocessing

## Album Data Model

The input data will already be available in structured form.

Each album should have at least:

```json
{
  "title": "Album Title",
  "artist": "Artist Name",
  "year": 1997
}
```

Recommended internal shape:

```json
{
  "id": "unique-id",
  "title": "Album Title",
  "artist": "Artist Name",
  "year": 1997
}
```

### Notes

* `id` should be included or generated so the app can track albums reliably
* The app should work fully with **text-only album data**
* Album art is a stretch goal, not a requirement

## Functional Requirements

### 1. Load Album Data

The app must load album data from a JavaScript constant or embedded JSON in the page.

For v1, it is sufficient to have something like:

```js
const albums = [...]
```

No file upload is required.

### 2. Build Initial Bracket

The app must create an initial bracket from the album list.

Requirements:

* Support a **64-item single-elimination-style seed layout**
* Random seeding is acceptable for v1
* Optional enhancement: allow preserving original order instead of randomizing
* Each matchup shows two albums side by side

Each visible album card should show:

* Album title
* Artist
* Year

### 3. Pairwise Selection

For each matchup, the user must be able to click one of the two albums as the winner.

Requirements:

* Clicking an album records the decision
* The selected album advances
* The bracket UI updates immediately
* The losing album should also be tracked for later placement/ranking logic
* The app must prevent ambiguous states

### 4. Support Full Ranking, Not Just Winner

The output must be a **sorted list of all albums**, not just the champion.

This is the most important structural requirement after basic interaction.

A simple single-elimination bracket alone is not enough to determine a full ranking, because many albums would tie by round of elimination. The implementation should therefore include some form of **placement logic**.

Acceptable implementation options, in order of preference:

#### Preferred: Winner + Placement Brackets

Use a main winner bracket plus additional placement logic so that final ranking can be derived more precisely.

Examples:

* winners advance toward rank 1
* losers continue into placement rounds
* final positions can be resolved for top tiers and then progressively lower tiers

This does not need to be mathematically perfect in a competitive-tournament sense, but it should produce a defensible **complete ordered list**.

#### Acceptable Alternative: Progressive Tier Resolution

If a full double-elimination or placement-tree implementation is too complex, use a practical approximation:

* main bracket determines overall advancement
* albums eliminated in the same round are grouped together
* within each elimination group, run additional mini-brackets or pairwise comparisons to order them
* continue until all albums have a unique final rank

This is acceptable if it is simpler to implement and easier to explain.

### 5. Display Current Progress

The UI should make it easy to understand:

* current round
* completed matchups
* pending matchups
* advancing albums
* overall progress through the ranking process

A simple progress summary is enough, such as:

* “Round 2 of 6”
* “18 of 63 decisions completed”

### 6. Show Final Results

At completion, show a clearly formatted final ranking in the UI.

Display format:

1. Rank number
2. Album title
3. Artist
4. Year

Example:

```text
1. OK Computer — Radiohead (1997)
2. Blue — Joni Mitchell (1971)
3. Innervisions — Stevie Wonder (1973)
```

### 7. Export Final Results as JSON

When ranking is complete, the app must produce JSON output that maps final rank to album.

Suggested output format:

```json
[
  {
    "rank": 1,
    "id": "ok-computer",
    "title": "OK Computer",
    "artist": "Radiohead",
    "year": 1997
  },
  {
    "rank": 2,
    "id": "blue",
    "title": "Blue",
    "artist": "Joni Mitchell",
    "year": 1971
  }
]
```

This should be:

* shown in a text area or code block on the page
* easy to copy manually

Optional enhancement:

* “Copy JSON” button

## UX Requirements

## Overall UX Goals

The app should feel:

* simple
* readable
* lightweight
* understandable without instructions

This is for local personal use, so polish matters less than clarity.

## Layout

A single-page layout is preferred, with these sections:

1. **Header / Title**
2. **Current bracket view**
3. **Current matchup focus area**
4. **Progress indicator**
5. **Final results section**
6. **JSON output section**

### Recommended Interaction Model

Because 64-item brackets can get visually dense, the UI should prioritize the **current active matchup** while still showing the broader bracket structure.

Recommended design:

* show one prominent current matchup at a time
* also show the bracket tree in smaller form for context
* completed choices should visibly propagate through the bracket

This is better than forcing the user to visually navigate a giant bracket for every decision.

## Matchup Card Design

Each album option should appear as a clickable card or button.

Each card should display:

* title prominently
* artist below
* year below that

The clickable targets should be large and obvious.

The selected winner should receive a visual confirmation.

## Bracket Visualization

The app should include a visual bracket representation.

Requirements:

* show rounds as columns
* show matchups within each round
* visually indicate winners advancing
* visually indicate completed vs incomplete matchups

This can be basic HTML/CSS. It does not need to be fancy or animated.

## State Management Requirements

All application state may live in memory in JavaScript.

Track at least:

* original album list
* seeded bracket structure
* outcomes of each matchup
* advancement state
* placement/ranking state
* final ordered result list

Recommended approach:

* represent each matchup as an object with:

  * matchup id
  * round number
  * side A album id
  * side B album id
  * selected winner id
  * loser id
  * next matchup target

This will make advancement logic much easier.

## Technical Constraints

* Must be a **static web app**
* Must run locally
* No backend
* No build step required
* Prefer no external dependencies
* Use:

  * `index.html`
  * optional `styles.css`
  * optional `script.js`

Vanilla JavaScript is preferred.

## Error Handling / Edge Cases

### Required

Handle these cases clearly:

* input list is empty
* input list has only one album
* input list size is not a power of 2
* duplicate albums exist
* user refreshes the page and loses progress

For v1, acceptable behavior:

* show a friendly validation message for unsupported input sizes
* no persistence required across refreshes

### Optional Enhancement

Persist progress to `localStorage` so a refresh does not lose work.

That would be useful, but not required for the first implementation.

## Stretch Goals

## 1. Album Art

If practical, optionally support album art display.

Desired behavior:

* given album title + artist + year, attempt to resolve album art from a public service
* if art is found, show it in the album card
* if not found, fall back cleanly to text-only display

Important constraints:

* the app must still work fully without album art
* do not make the core experience depend on external APIs

Because this is a static local page, any album-art solution should be simple and browser-friendly. If an external API is used, it should be optional and degrade gracefully.

## 2. Shuffle / Reseed

Provide a button to reshuffle the initial bracket before starting.

## 3. Save / Load Progress

Persist state to `localStorage` and restore it automatically on reload.

## 4. Copy / Download Results

Allow the final ranking JSON to be copied or downloaded.

## 5. Manual Input Editing

Future enhancement only: allow editing the album JSON directly in a textarea.

## Non-Goals

For this version, do **not** spend time on:

* backend services
* user accounts
* syncing
* authentication
* multi-user support
* responsive mobile-first perfection
* sophisticated accessibility audits beyond sensible semantic HTML
* drag-and-drop reordering
* importing from music services
* complex database-backed album metadata

## Implementation Guidance

The coding agent should optimize for:

* correctness
* simplicity
* understandable code
* easy future modification

Do not overengineer.

A good implementation would likely:

1. Validate and normalize input data
2. Seed the initial bracket
3. Render bracket and current matchup
4. Handle clicks to record results
5. Advance winners and track losers
6. Resolve full ranking through placement logic
7. Render final ordered list
8. Render JSON export

## Suggested Deliverables

The coding agent should produce:

* `index.html`
* `styles.css`
* `script.js`

And include:

* sample album data embedded in the script
* brief comments explaining main data structures
* a short README comment at the top of the script or HTML explaining how to run it locally

## Acceptance Criteria

The project is successful if all of the following are true:

* A local static HTML page opens in a browser without a server
* It loads a list of up to 64 albums from embedded JSON/JavaScript
* It presents pairwise matchups in a bracket-style experience
* Clicking a winner advances that album correctly
* The app continues until all albums are ordered
* The final result is a unique sorted ranking of every album
* The final ranking is shown on screen
* The final ranking is also available as JSON
* The app remains usable even if album art is not implemented

## Suggested Clarification for the Coding Agent

One important design detail is that this project is **not just “pick a tournament winner.”** The real requirement is to produce a **full sorted list** from pairwise choices. So the ranking logic should be treated as a first-class feature, even if the bracket visualization is the most visible part of the UI.

If simplifying tradeoffs are needed, prefer:

* a simpler UI
* a clearer ranking algorithm
* reliable JSON output

over visual flourish.

## Short Version

Build a small static browser app that:

* takes ~64 albums from embedded JSON
* shows them in pairwise bracket matchups
* lets the user repeatedly choose winners
* advances choices through the bracket
* uses loser/placement logic to derive a full ordered ranking
* displays the final ranked list
* outputs that list as JSON

If you want, I can also turn this into a more agent-ready version with sections like “Requirements,” “Architecture,” “Data structures,” and “Implementation steps.”
