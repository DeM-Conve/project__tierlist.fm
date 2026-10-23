# QA pass (started 2026-10-22)

Goal: no new features. Every existing feature in `docs/features.md` works correctly,
feels seamless, has no lag, and has tests. Each area is one workstream on its own
`qa/*` branch off `fix/sync-integration`, merged and deployed together.

Method for every area:
1. Treat each bullet of the area's `docs/features.md` section(s) as a checklist item.
2. Verify it against the code and a test (add a Vitest / backend test where missing).
3. Fix bugs, UX rough edges (CLAUDE.md design rules: Mantine, tokens, scales, one
   button system, PageHeader) and slow paths inside existing features.
4. Note anything that needs the user's decision under "Open questions" instead of
   guessing. Tick the item here when it's verified.

Status: `[ ]` not started · `[~]` in progress · `[x]` verified · `[!]` needs the user

## Already in flight (sync reliability)
- [x] Sync review fixes - lagging re-read, stuck held-back changes, per-playlist renames (`fix/sync-review`, merged, deployed 2026-10-22)
- [x] Deep sync test harness + fuzzing, cross-tier dedupe rule, Add songs undo id (`test/sync-harness`, merged, deployed 2026-10-22)
- [x] Undo/redo after a push never drops or revives a song (`fix/undo-after-push`, merged, deployed 2026-10-22)

## 1. Boards (`qa/boards`, merged, deployed 2026-10-23)
- [x] Tier boards: layout, fit-to-screen, +N / show all, empty tiers, counts, header bar
- [x] Tier page (full list), Find (`/`), filter, play/shuffle per tier
- [x] Tier Rail: drop targets, counts, Remove bin, playing-song drag
- [x] Drag-and-drop UX (within tier, between tiers, to rail, to sidebar board) - not sync logic
- [x] TODO list: triage, to-do list linking modal, counts
- [x] Big boards (300+ songs) stay smooth: render cost, virtualization, drag lag

## 2. Player & navigation (`qa/player`, merged, deployed 2026-10-23)
- [x] Player dock: expanded / mini / floating, never remounts, survives navigation
- [x] Queue panel, shuffle play, repeat, volume, seek, rate chips, Remove from player
- [x] Keyboard shortcuts (full list) + shortcuts modal + link hints
- [x] Command palette

## 3. Duels (`qa/duels`, merged, deployed 2026-10-23)
- [x] Duel hub, session start, matchups, verdicts, skips, summary
- [x] Suggested moves (Move pushes at once, Keep, locks), score map / trend
- [x] Tier borders setting (learned / my own ranges) end to end
- [x] Engine correctness (backend unit tests), TODO songs never in duels

## 4. App shell, Home, Add songs, Settings (`qa/shell`, merged, deployed 2026-10-23)
- [x] Login / auth errors, load-failure cards (never skeleton forever)
- [x] Home & playlists, Sidebar (filter, prefetch, board counts, spring-loaded open)
- [x] Add songs flow
- [x] Settings: playlist naming (matching preview), appearance (themes/accents/palettes), duels, activity bar order
- [x] Routing, PWA, theming in light + dark, phone width

## 5. Performance (`qa/perf`, merged, deployed 2026-10-23)
- [x] Cold start and board open time, bundle/chunk sizes, lazy pages
- [x] Re-render hot spots (selectors, memoization), drag frame rate
- [x] YouTube quota / request count per action, board cache behaviour
- [x] Backend endpoint latency, N+1 queries, compression

## 6. Backend & API (`qa/backend`, merged, deployed 2026-10-23)
- [x] Every endpoint: auth required, input validation, ProblemDetail errors
- [x] Settings ETag flow, migrations, playlists rename/create, tier-sync contract
- [x] Backup / restore scripts work under hl

## Follow-ups
- [x] Frontend tier-name validation matches the backend's (no "①", "S²" = "S") (`fix/tier-label-parity`, merged, deployed 2026-10-23)
- [ ] Find with a one-letter query on a 300-song board still renders ~5000 components (input stays responsive)
- [ ] Duel session start analyses the board twice (~30 ms on 333 songs)

## Open questions for the user
- [!] `scripts/restore.sh` run without hl's COMPOSE_* variables restores into a fresh standalone db, not hl's - refuse when no project is set and an `hl-*` project is running?
- [!] Add songs: Enter always means "listen", even on a focused button - pass Enter through after Tab (keyboard focus) only?
- [!] Pasting non-link text outside a text box is silently ignored - show a message everywhere?
- [!] Add songs page is capped at 1100px wide (against "pages are full width") - keep so tier targets don't stretch?
- [!] Leaving Settings -> Playlist naming with unsaved changes gives no warning - ask first?
- [!] Hand-linked to-do lists aren't counted in the naming page's "Matching playlists" counts - count them?
- [!] Activity bar icons have two tab stops each (icon + drag handle) - accept?
- [!] Duels: a locked song can't be unlocked after leaving the page (nowhere lists locks). Add an unlock place?
- [!] Duels: "Don't know one of them" (`s`) always skips song B - add a way to say it's song A?
- [!] Duels: 2-minute grace to answer the last duel after time runs out - right length?
- [!] Shift+digit rating: the player and Tier Rail number only the tiers a board has (no S tier -> Shift+1 = A), Add songs always uses fixed S-D. Which should it be?
- [!] Opening another board silently drops the open board's staged (unpushed) moves - only
  dragging to another board warns. Keep a draft per board, or confirm before leaving?
  (test: "keeps the staged moves of the board left behind", `it.fails`)
- [x] `useBoardDropOpen` counted auto-dedupes as staged changes (fixed in qa/boards).
- [!] Big tiers: a tile's full title is now the browser's native tooltip (fast), not Mantine's. OK?
- [!] Tier page keeps its filter text when switching tier tabs - clear it instead?
- [!] Custom to-do name reads "Add a Inbox list" - reword?
- [!] Dropping a song from another board onto this board's Remove bin does nothing (by design) - keep?
