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

## 2. Player & navigation (`qa/player`)
- [~] Player dock: expanded / mini / floating, never remounts, survives navigation
- [ ] Queue panel, shuffle play, repeat, volume, seek, rate chips, Remove from player
- [ ] Keyboard shortcuts (full list) + shortcuts modal + link hints
- [ ] Command palette

## 3. Duels (`qa/duels`)
- [ ] Duel hub, session start, matchups, verdicts, skips, summary
- [ ] Suggested moves (Move pushes at once, Keep, locks), score map / trend
- [ ] Tier borders setting (learned / my own ranges) end to end
- [ ] Engine correctness (backend unit tests), TODO songs never in duels

## 4. App shell, Home, Add songs, Settings (`qa/shell`)
- [ ] Login / auth errors, load-failure cards (never skeleton forever)
- [ ] Home & playlists, Sidebar (filter, prefetch, board counts, spring-loaded open)
- [ ] Add songs flow
- [ ] Settings: playlist naming (matching preview), appearance (themes/accents/palettes), duels, activity bar order
- [ ] Routing, PWA, theming in light + dark, phone width

## 5. Performance (`qa/perf`)
- [ ] Cold start and board open time, bundle/chunk sizes, lazy pages
- [ ] Re-render hot spots (selectors, memoization), drag frame rate
- [ ] YouTube quota / request count per action, board cache behaviour
- [ ] Backend endpoint latency, N+1 queries, compression

## 6. Backend & API (`qa/backend`)
- [ ] Every endpoint: auth required, input validation, ProblemDetail errors
- [ ] Settings ETag flow, migrations, playlists rename/create, tier-sync contract
- [ ] Backup / restore scripts work under hl

## Open questions for the user
- [!] Opening another board silently drops the open board's staged (unpushed) moves - only
  dragging to another board warns. Keep a draft per board, or confirm before leaving?
  (test: "keeps the staged moves of the board left behind", `it.fails`)
- [x] `useBoardDropOpen` counted auto-dedupes as staged changes (fixed in qa/boards).
- [!] Big tiers: a tile's full title is now the browser's native tooltip (fast), not Mantine's. OK?
- [!] Tier page keeps its filter text when switching tier tabs - clear it instead?
- [!] Custom to-do name reads "Add a Inbox list" - reword?
- [!] Dropping a song from another board onto this board's Remove bin does nothing (by design) - keep?
