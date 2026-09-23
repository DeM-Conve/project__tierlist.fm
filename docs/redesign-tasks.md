# App redesign - task tracker (branch `feat/board-reimagine`)

Direction: **the tier list is the moat** (see `PRODUCT.md`). UX first, then UI.
Every tier edit gives instant feedback + Undo (toast, Ctrl+Z). No feature may be lost -
check `docs/features.md` (incl. the shortcut list) before ticking the final item.

Legend: `[x]` done · `[~]` in progress · `[ ]` to do

## Foundations
- [x] Record direction in `PRODUCT.md` (+ memory)
- [x] Add `html-to-image` (share export) and `@mantine/notifications` (undo toasts)
- [x] Undo stack in `tiersSlice` (`moveVideos`, `applyTierOrder`, `undoLastEdit`)
- [x] `tierActions.jsx`: `moveWithFeedback` / `undoEdit` thunks + shared `useTierDnd`
- [x] `PendingChanges.jsx`: staged-changes bar + review modal + Shift+P, shared by all board pages
- [x] `TierBits.jsx`: TierTile, TierChip, TierMixBar, MoveMenu, drop-index helpers
- [x] Global Ctrl+Z (undo) hotkey in the layout

## Tier list surfaces
- [x] **Tier Rail** (`TierRail.jsx`): permanent right-edge tier strip - drop target, rate the playing song, bulk-move target, open tier
- [x] **Tier list page**: whole board on one screen - one compact row per tier, "+N" overflow tile, play/shuffle per tier, tier-mix bar, Find / Share / Rank / Play
- [x] **Tier focus page** (`/tier/:category/t/:tier`): dense list for big tiers - tier tabs, filter, multi-select (shift-range), one-click tier chips, drag reorder, bulk bar
- [x] **Quick sort** (`/tier/:category/sort`): song plays, press 1-5 to set tier, auto-advance, skip, undo, summary
- [x] **Share as image**: tier-list poster modal - download PNG / copy to clipboard
- [x] Duel: reachable from "Rank" menu; result applied as one undoable edit

## App shell
- [x] Sidebar: brand, ⌘K, filter, boards with mini tier-mix bars, Home, Settings / shortcuts / log out
- [x] Home (`/`): gallery of boards drawn as mini tier lists + all playlists (board badges), now-playing card
- [x] Playlist page: list rows, board/tier badge + "Open board" link
- [x] Mobile: Mantine burger instead of the hand-rolled "Menu" button; rail hidden, chips/menus instead

## Player
- [x] Mini bar: tier chips for the playing song (same board); Shift+1-5 works in every mode, not just expanded
- [x] Expanded: "Up next" queue panel (click to jump) + tier-colored glow; player never remounts
- [x] Rating from player/rail goes through `moveWithFeedback` (toast + undo)

## Settings & palette
- [x] Settings: add "Keyboard shortcuts" tab
- [x] Command palette: Quick sort + "Open <tier>" entries (Share stays on the board header)

## Wrap-up
- [x] Remove dead CSS in `App.css` for everything replaced
- [x] Update `docs/features.md` + `shortcuts.js`; walk the checklist - no feature lost
- [x] Build, lint, click-through test with a mock API (desktop + mobile)
- [x] Deploy, verify bundle hash (index-DdJmCDmt.js)
- [x] Commit on `feat/board-reimagine`

## Found along the way
- [x] Pre-existing bug: refreshing directly on a board URL left it blank (board loaded before playlists) - fixed in `useLoadTierBoard`

## Next pass (not in this one)
- [ ] "All-time T1s" mix across every board - needs per-board state (tierItems keyed by category) so songs can be rated from any board
- [ ] Multi-drag (drag a whole selection at once)
