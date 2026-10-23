# Requirements and product decisions

What Tierlist.fm must do and why, including every explicit call the maintainer has
made about the product. Each requirement says *what* and *why*; *how* it's built is in
[`architecture.md`](architecture.md) and the rules for changing the code are in
[`CLAUDE.md`](../CLAUDE.md). Positioning and principles are in
[`PRODUCT.md`](../PRODUCT.md); the page-by-page feature list is
[`features.md`](features.md).

"The user's call" below means a decision the maintainer stated explicitly - treat it as
settled; ask before reversing one. Anything not settled is under **Open questions**
at the end - don't invent an answer for those.

## The problem

A YouTube / YouTube Music playlist is a flat list. After a few hundred songs there's no
way to say which ones you love most - you can only scroll. People already organise
music into playlists by hand; they have no tool that turns those playlists into a
ranking without re-entering everything somewhere else.

## Who it's for

- **Primary user**: the maintainer, who listens on YouTube Music, keeps genre/category
  playlists split by quality (`Rap S`, `Rap A`, ...) and wants to rank, re-rank and
  listen in one place.
- **Secondary**: anyone with the same habit who will **self-host** it (Docker Compose
  + their own Google Cloud OAuth client). Any Google account the instance owner admits
  can log in; each account sees only its own playlists, settings and duel history.
- **Not** a hosted service: the license forbids offering it as one without permission,
  and there is no cross-user sharing or social feature.
- Tech-comfortable, keyboard-heavy users: the UI is modelled on VS Code and Vim/Vimium.

## Core requirements

### R1. YouTube playlists are the tier list (source of truth)

- A tier **is** a YouTube playlist; a board is the set of playlists sharing a
  `{category}`. Moving a song between tiers moves it between playlists on YouTube.
- Why: nothing is locked into the app - the ranking plays on every YouTube / YouTube
  Music device, and the app can be dropped at any time without losing anything.
- The app stores no copy of playlist contents on the server. Postgres only holds what
  YouTube can't: settings and duel history.

### R2. Read structure from names the user already maintains

- Which playlists are tiers is decided by the user's **naming**: a template with exactly
  two product tokens, `{category}` and `{tier}`, plus the user's names for the five tiers
  and the to-do list. Default `{category} {tier}` with `S A B C D` / `TODO`.
- Any other `{word}` in the template is the user's own free-text token, kept as-is.
- First use auto-detects the naming that fits the user's existing playlists.
- The user's call: **never build a personal convention into the product** (no built-in
  or detected custom token names, no examples taken from a real library).
- The user's call: **Settings -> Playlist naming never renames playlists** - it only
  decides which playlists are tier playlists, with a live preview. Renaming happens only
  when the user renames a board (click its name), which renames that board's playlists.
- Tier names are free (e.g. `T1..TZ`, `(**TODO**)`), matched exactly; each tier can also
  have a separate "shown as" name used everywhere on screen. Internally tiers are fixed
  slots `S A B C D` + `TODO`.

### R3. Privacy

- Playlists that don't match the naming are **invisible everywhere** in the app (only a
  count is shown). Why: the user's account may hold playlists that are nobody's business,
  including on a shared screen.
- Each account's data is separate; nothing is shared between accounts.
- The public repo contains nothing personal (no real name, employer, email, home paths
  or real playlists) - only the `DeM-Conve` identity (the user's call).

### R4. Safe editing: stage, review, push

- Every edit is staged locally first and reaches YouTube only on **Push to YouTube**,
  except a duel **Move** (R7). Edits have instant feedback (toast) and Undo/Redo
  (`Ctrl+Z`, 50 steps).
- Push inserts into the new playlist **before** deleting from the old one, so a failure
  never loses a song; failures are reported per item, each saying which step failed
  and why, and stay staged until pushed, put back or discarded.
- A push never creates a duplicate or loses track of a song: a pushed song takes its new
  playlist-item id at once, so moving it again without a reload never re-inserts it.
- **Undo never puts back or takes away a song behind YouTube's back**: after a push,
  undoing a pushed move stages the way back, but a pushed removal stays removed and
  drops out of the history.
- Staged edits are never thrown away by navigation, a remount or a background refresh.
- Removing a song from a playlist is a staged change like a move.
- Duplicates are resolved automatically (the user's call: no manual dedupe UI), across
  tiers and - the user's call, 2026-10-22 - also a song listed twice in one tier
  playlist (shown once, extra copies removed on push). The exact rule is in CLAUDE.md ("Duplicate videos are auto-resolved") and
  `features.md` ("Duplicate cleanup").

### R5. The tier list is the product (positioning)

- The user's call (2026-09-23): plain listening is YouTube Music's job; this app earns
  its place only through the tier list. Every surface should be driven by it: the whole
  board on one screen, a permanent Tier Rail, rating the playing song from anywhere.

### R6. To-do list: an unranked tier

- Each board can have one to-do playlist: an inbox for new songs (saved on a phone,
  say), placed into tiers later via **Triage** (play them in order; rating the playing
  song files it and moves on).
- The user's calls: TODO *is* a tier type, just unranked - it follows the naming (the
  to-do name in `{tier}`'s place), is matched literally like any tier (no keyword/fuzzy
  matching), and can also be assigned to a board by hand. Settings has no to-do section.

### R7. Duels: evidence-based ranking that the user approves

- Head-to-head listening (two clips, five-step verdict) feeds a hidden score per song.
  A single duel never moves a song; a tier change is only **suggested** once the
  evidence clears a bar (>= 85% probability, >= 4 duels, >= 2 opponents near that
  border), and the user approves it (Move / Keep / Lock).
- The user's calls:
  - The algorithm lives **only in the backend** (its own package, plain Java); the
    frontend only shows results.
  - Every duel datum is stored in Postgres per account, never in the browser.
  - **"Move should mean literal move"**: approving a suggestion pushes that song's
    move to YouTube at once, leaving other staged edits alone.
  - **To-do songs are never part of duels** - the user places them by hand.
  - Duel is the one ranking mode (Quick sort was removed); the "One song" and
    "Place TODO" modes were removed.
- **Tier borders**: by default the borders between tiers are learned from where the
  user put songs; Settings -> Duels lets the user set their own score range per tier
  instead (on the score the duel pages show), and suggestions, pairing, certainty and
  the fence then follow those ranges. One setting per account, not per board.

### R8. A player that never stops

- A YouTube-Music-style player with a real queue (play next, add to queue, shuffle,
  repeat) that keeps playing across every navigation, in mini, floating-corner and
  expanded layouts. Changing layout must never interrupt playback.
- The playing song can be rated or removed from any page (`Shift+1-5`, `Del`, the rail).
- The only page that pauses it is a duel matchup, whose clips are the audio.

### R9. Getting songs in

- Paste YouTube / YouTube Music links (anywhere, `Ctrl+V`); the board is guessed; one key
  files the song into a tier or the to-do list, with undo.
- **Links only, no YouTube search** - a search costs 100 quota units, a link 1.

### R10. Respect the YouTube API quota

- Default quota is 10,000 units/day per Google Cloud project (shared by all accounts on
  an instance). Writes cost 50 units each. So: never refetch YouTube data on a remount,
  request only the fields used, cache boards on the device, avoid features whose cost
  scales badly (search, polling).

### R11. Fast

- The user asked for a fast end-to-end experience: big boards open instantly from the
  device cache, compressed responses, split bundle, parallel writes, prefetch on hover.

### R12. Keyboard-first, VS Code-like workbench

- A shortcut for nearly everything, discoverable (`?`, keys printed on buttons),
  Vimium-style link hints and `g`-sequences, VS Code keys (palette, `Ctrl+B`, views).
- The shell looks and behaves like VS Code's workbench (activity bar, resizable side
  panel, page as a card, VS Code density).

### R13. Settings follow the account; UI state stays on the device

- Appearance (6 themes, 8 accents, 3 tier palettes), naming, to-do assignments, the
  activity-bar order and the duel tier borders are saved per Google account and load in any browser. Two devices
  editing at once must not overwrite each other.
- Per-device UI state (panel width/state, volume, repeat, duel session length, Add
  songs' last board) stays in the browser.

### R14. Consistent UI from one library

- The user's calls: Mantine is the one UI library (MUI, Tailwind, shadcn/ui and bare
  Radix were tried or considered and rejected); prefer popular, maintained libraries
  over hand-written code, every time; every color, spacing and font size is a token;
  one button system; one page header; pages are full width.

### R15. Errors say why

- A failed load explains what went wrong in plain language (quota used up, login
  expired, YouTube permission not ticked) with a way out - never an endless skeleton.

### R16. Self-hostable by others

- One `.env` (documented in `.env.example`) configures everything; one published port;
  works at a root URL or under a sub-path behind any reverse proxy; nightly backups and
  a checked restore; migrations run on start; old `.env` names keep working.
- The user's call: no homelab- or proxy-specific config in this repo.
- Installable as a desktop app (PWA).

### R17. Quality gates

- The user's calls: **tests gate every deploy** (`scripts/deploy.sh`), no CI pipeline
  (tests run locally), backend line coverage >= 80%, a bug fix comes with a failing-first
  test, `docs/features.md` is the no-regression checklist for any redesign.

### R18. Open source, maintainer-controlled history

- Public repo, Business Source License 1.1 (free personal non-commercial self-hosting;
  each version becomes MIT four years after release; change date 2033-01-01).
- Trunk-based, every change through a PR, merged locally so history is authored only by
  `DeM-Conve`; no AI co-author lines (the user's calls).

### Future direction (not active work)

- Native iOS / Android apps were discussed as a long-term possibility. Nothing today
  should be built as if that's imminent.

## Removed or rejected (don't bring back without asking)

| What | Why / when |
|---|---|
| Quick sort (press 1-5 per song) and Share-as-image poster | The user found them not good (2026-09-23); Duel is the one ranking mode |
| "All songs / Compact" board layouts, hover+digit moves | Built and reverted the same day (2026-09-23) |
| Multi-select / bulk move on the tier page | Dropped (2026-09-23); moving is per song |
| Liked-songs "Inbox" and in-app YouTube search | Replaced by Add songs with pasted links only (quota) |
| Frontend duel strategies and the Settings "default strategy" | Ranking moved to the backend engine |
| Duel "One song" and "Place TODO" focuses | The user's calls; to-do songs are placed by hand |
| Renaming playlists when the naming changes | Settings only identifies playlists now |
| A to-do section in Settings | The user removed it; to-do lists are added from the board |
| The board header's Triage button | The TODO row's play button triages |
| Real Document Picture-in-Picture | YouTube's embed refuses to play in another window |
| A `dev` integration branch | Retired 2026-09-24 for trunk-based `main` |

## Open questions

Unresolved - ask the user rather than assume. The QA pass (2026-10-22/23) raised more,
mostly about single features (Add songs keys, duel locks and skips, Shift+digit
numbering, staged moves when opening another board, ...); those are tracked in
[`qa-pass.md`](qa-pass.md#open-questions-for-the-user), not repeated here.

1. **Within-tier order.** Reordering songs inside a tier (drag, or "Tighten tier order"
   on Suggested moves) only changes the local draft: Push never sends positions, so the
   order is lost on reload or Discard, yet the Suggested moves page says "positions are
   ranks on YouTube". Should order be pushed to YouTube (playlist-item position
   updates, 50 units each), or should the UI stop implying it is?
2. **Audience beyond the maintainer.** With the Google consent screen in *Testing*
   mode only listed test users can log in (Google caps this at 100), and leaving Testing
   needs Google's verification for the YouTube scope. Is wider self-hosting by strangers
   a goal worth documenting/supporting further, or is "bring your own Google Cloud
   project" the permanent model?
3. **First release.** Nothing is tagged yet (backend version `0.0.1-SNAPSHOT`). When,
   and what should `v0.1.0` contain?
4. **Backlog ideas from the 2026-09 redesign** - still wanted? An "all-time S tier" mix
   across every board (needs per-board state), and dragging a whole selection at once
   (multi-select was since dropped from the tier page).
5. **Accessibility.** No requirement has been stated (PRODUCT.md). Is there a target
   (e.g. keyboard-only and screen-reader basics, contrast in every theme)?
6. **Retired schema bits** (`ONE_SONG` / `PLACE_TODO` enum labels, `duel_session.song_id`)
   wait for "the next schema reset" - is a reset ever planned, or should a forward
   migration drop them?
7. **Mobile.** Phones get a drawer sidebar and compact layouts, but no requirement says
   how much of the app must work on a phone (e.g. duels, drag-and-drop).
8. **Which deploy path is canonical for the maintainer's own instance?**
   `scripts/deploy.sh` (the documented, test-gated way to ship) starts the standalone
   `tierlistfm` Compose project and checks the bundle served on
   `localhost:TIERLIST_PORT`. An instance run by an external runner (e.g. a homelab tool
   that uses its own Compose project name, a proxy and a sub-path) isn't what the script
   deploys or checks. Should the script support that case (project name, URL to check),
   or should such instances be rebuilt by their runner after the tests pass?
