# Status and pending work

Where the project stands and what's left. Update this file when an item lands or a new
one comes up (there's no issue tracker in use). Product-level open questions are in
[`requirements.md`](requirements.md#open-questions).

## Current state (2026-10-22)

- **Shipped and in daily use** by the maintainer: tier boards, tier pages, the Tier
  Rail, the global player and queue, to-do lists and triage, Add songs by link, moving
  songs across boards, board rename, staging + Push, duels on the backend engine,
  per-account settings in Postgres, the device board cache, VS Code-style shell and
  keyboard layer, PWA install, self-hosting via one `.env` (root or sub-path), nightly
  backups. Everything user-facing is listed in [`features.md`](features.md).
- **Schema**: Flyway `V1` (live data) + `V2` (Duels activity-bar item).
- **Not released**: no `vX.Y.Z` tag yet; ask before cutting the first.
- **No CI**: tests run locally and gate `scripts/deploy.sh`.

## Engineering backlog

### Replace hand-rolled UI code with Mantine / proven libraries

The user, 2026-10-10: "use the Mantine and other built-in things only, don't create
your own when we have already tested solutions and libraries". Swap one at a time,
with tests.

Done: the sidebar's resize edge (`react-resizable-panels`); `PendingChanges` Shift+P
(Mantine `useHotkeys`); the tier page's `/` and filter Escape (`react-hotkeys-hook` +
Mantine `getHotkeyHandler`); the dock's progress polling (Mantine `useInterval`,
`usePlayerTime.js`); the sidebar's spring-loaded board open (Mantine `useTimeout`);
dead `App.css` rules (`appCss.test.js` fails on any class nothing uses); React Router
and TanStack Query + axios (no raw `fetch` in components).

Left, each riskier than a one-for-one swap:

- The big page keydown handlers (`PlayerDock`, `TierBoardView` search, `AddSongsView`,
  `DuelMatch`) - capture phase and ordering with
  `keyboard/sequence.js` and `LinkHints` matter.
- `LinkHints`' while-open window listeners (could be `useWindowEvent`, same caveat).
- `sequence.js`'s module-level listener (react-hotkeys-hook doesn't expose its
  pending-sequence state).
- Native HTML5 drag-and-drop in `tierActions` `useTierDnd` / board / tier page / queue
  (`@hello-pangea/dnd` is installed, but the sidebar cross-board drop and the
  virtualizer drop slot depend on native drag events).
- `tierUtils.indexForPointInFlow` and the canvas-offset `getBoundingClientRect` reads
  in `TierBoardView` / `TierFocusView` (board-fit maths, virtualizer `scrollMargin`).
- The dock's click-to-seek line (could be a Mantine `Slider`, but it's tied to the
  dock's mini/floating CSS).

### Stop hand-writing CSS

Most of the app is Mantine components now (board, tier page, rail, home, sidebar,
duels, settings). Still hand-rolled in `App.css` (~500 lines): the `PlayerDock`
expanded/mini/floating layouts and queue grid, tiles and board rows, the shell
(`.sidebar`, `.canvas-card`, `.sash`), the duel card hover, and a few animations.
Convert opportunistically when one is next touched - no big-bang rewrite - and delete
a rule in the same pass as its last use.

### Smaller items

- **React Hook Form** is installed but there's no real form to use it on. Not a gap to
  close proactively.
- **Retired schema bits** (`duel_focus` labels `ONE_SONG` / `PLACE_TODO`,
  `duel_session.song_id` and its CHECK) - harmless; drop at the next schema reset (see
  requirements open question 6).
- **Signed-in screenshots** for the README (board, duel, player, settings) are
  commented out until the maintainer captures them with their own login.
- **Within-tier order isn't pushed to YouTube** - see requirements open question 1.

## Recently done (for context)

- 2026-10-16: self-hosting config (one `.env`, same-origin frontend, healthchecks),
  optional sub-path (`TIERLIST_BASE_PATH`), empty tiers keep a full tile line, tier-page
  Play / Shuffle keys, the playing song is never folded behind "+N".
- 2026-10-15: speed pass (compression, split bundle, parallel YouTube writes, prefetch).
- 2026-10-10 to 10-12: backend duel engine and screens, VS Code-style shell, device
  prefs, board cache, Duels view, to-do songs out of duels, "up one level" navigation.

`git log` is the full history.
