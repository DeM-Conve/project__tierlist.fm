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

## 7. Cross-feature journeys (started 2026-10-23)
The user's finding: every feature works alone, but moving between them is incoherent (rate a song
from Settings, open another board, come back - the rating is gone). Each journey below runs end to
end through the real App over the fake YouTube (`src/test/syncHarness.jsx`) and must leave the
boards, the pending bar, the player, the rail and YouTube agreeing with each other.
- [x] Staged changes survive navigation: per-board drafts, one global pending bar, auto-dedupes
  shown apart, rating the playing song from any page stages on its own board, drafts kept across
  reloads per account (`fix/board-drafts`, `src/drafts.e2e.test.jsx`)
- [x] Play from board A, browse to B / Home / Settings / Duels, rate / remove / skip from the player
  (`qa/journeys-player`, `src/journeys.player.e2e.test.jsx`: the player's tier is read live from its
  board, each queued song keeps its own board, no rating for a song that left its board, triage only
  advances on its own board)
- [x] Duel on A while the player plays a song from B; suggested Move pushes; back on B
  (`qa/journeys-player`; a staged edit on A kept on the way to B - `fix/board-drafts`)
- [x] Add songs into A and B, then drag them, undo, push, reload (`qa/journeys-edit`,
  `src/journeys.edit.e2e.test.jsx`: undoing a filing now also drops its staged move to another board)
- [x] Drag a song to another board via the sidebar, change your mind on the target board, push
  (`qa/journeys-edit`: a song sent to a board that already has it is no longer pushed twice)
- [x] Change naming / tier names / theme in Settings with staged changes and a playing song
  (`qa/journeys-edit`: a move into a tier that lost its playlist is held back instead of deleting the
  song; the player names its tier by the current name. `fix/board-drafts`: a naming change that changes
  the open board's playlists rebuilds it, its draft laid over)
- [x] Push failure (quota) mid-journey, then navigate, reload, retry (`qa/journeys-edit`;
  `fix/board-drafts`: one global bar, so no other board says "Sync failed" with nothing staged; a
  half-done move's leftover delete is kept in the saved draft, so a reload keeps the move)
- [x] Two browser tabs on the same account (staged changes, settings, pushes) (`qa/journeys-edit`:
  playlist writes are announced to other tabs, whose next push re-reads them - no duplicate, no
  removed song back; settings already merge on 412. `fix/board-drafts`: the other tab's open board is
  redrawn, its draft laid over)
- [x] Every page's counts (sidebar, header bar, rail, pending bar, Home cards) agree at every step
  (`qa/journeys-player`: a push now updates the sidebar / Home / off-board rail counts;
  `fix/board-drafts`: a board with unpushed changes is counted as its draft everywhere, with an
  "unpushed" dot)

## Follow-ups
- [x] Frontend tier-name validation matches the backend's (no "①", "S²" = "S") (`fix/tier-label-parity`, merged, deployed 2026-10-23)
- [ ] Find with a one-letter query on a 300-song board still renders ~5000 components (input stays responsive)
- [ ] Duel session start analyses the board twice (~30 ms on 333 songs)

## Open questions for the user
- [x] A push that added a song to its new tier but couldn't delete the old copy, then a reload:
  the board found it in both tiers and auto-deduped to the higher one, undoing the move. Decided:
  remember the leftover delete on this device - it's part of the saved draft (`fix/board-drafts`;
  the test "added but not removed, then reloaded before the retry" passes). A different browser
  still auto-dedupes it the documented way.
- [!] `scripts/restore.sh` run without hl's COMPOSE_* variables restores into a fresh standalone db, not hl's - refuse when no project is set and an `hl-*` project is running?
- [!] Add songs: Enter always means "listen", even on a focused button - pass Enter through after Tab (keyboard focus) only?
- [!] Pasting non-link text outside a text box is silently ignored - show a message everywhere?
- [x] Add songs page was capped at 1100px wide (against "pages are full width"). Decided: full
  width like every page (`fix/add-songs-full-width`).
- [!] Leaving Settings -> Playlist naming with unsaved changes gives no warning - ask first?
- [!] Hand-linked to-do lists aren't counted in the naming page's "Matching playlists" counts - count them?
- [!] Activity bar icons have two tab stops each (icon + drag handle) - accept?
- [!] Duels: a locked song can't be unlocked after leaving the page (nowhere lists locks). Add an unlock place?
- [!] Duels: "Don't know one of them" (`s`) always skips song B - add a way to say it's song A?
- [!] Duels: 2-minute grace to answer the last duel after time runs out - right length?
- [!] Shift+digit rating: the player and Tier Rail number only the tiers a board has (no S tier -> Shift+1 = A), Add songs always uses fixed S-D. Which should it be?
- [x] Opening another board silently dropped the open board's staged (unpushed) moves.
  Decided (the user, 2026-10-23): **a draft per board** - unpushed changes belong to their
  board and never vanish on navigation; one global pending bar pushes every board's; auto-dedupes
  shown apart; rating the playing song stages it on its own board; drafts survive a reload
  (`fix/board-drafts`; the test "keeps the staged moves of the board left behind" passes now).
- [x] `useBoardDropOpen` counted auto-dedupes as staged changes (fixed in qa/boards).
- [!] Big tiers: a tile's full title is now the browser's native tooltip (fast), not Mantine's. OK?
- [!] Tier page keeps its filter text when switching tier tabs - clear it instead?
- [!] Custom to-do name reads "Add a Inbox list" - reword?
- [!] Dropping a song from another board onto this board's Remove bin does nothing (by design) - keep?
