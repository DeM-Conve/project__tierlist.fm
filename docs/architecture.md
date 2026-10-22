# Architecture

How Tierlist.fm is put together: the moving parts, where state lives, the main flows,
the HTTP API and the database. The *rules* for changing this code (libraries to use,
patterns to follow, things never to do) are in [`CLAUDE.md`](../CLAUDE.md); this file
is the map.

## The big picture

```
browser ── one origin ──► frontend container (nginx)
  React SPA (Vite build)      ├─ /            static bundle (+ PWA service worker)
  IndexedDB board cache       ├─ /api/        ─┐
  localStorage device prefs   └─ /oauth2/, /login/oauth2/ ─┤ proxied
                                                           ▼
                              backend container (Spring Boot, in-memory session)
                                ├─ YouTube Data API v3  (the user's own OAuth token)
                                └─ Postgres 17 (db container) - settings + duel history
                              backup container - nightly pg_dump of db
```

- **YouTube is the source of truth for what's in each tier.** A tier *is* a YouTube
  playlist; moving a song between tiers is a playlist-item insert + delete on YouTube.
  The app keeps no copy of playlist contents on the server.
- **Postgres holds only what YouTube can't**: per-account settings and the duel log
  (and what's derived from it: starting scores, the user's decisions, locks).
- **The browser holds the editable draft** of the open board (Redux `tiersSlice`):
  edits are staged there and only reach YouTube on **Push**.
- Only the frontend container publishes a port. Its nginx serves the bundle and
  proxies the API and Google-login paths to the backend, so the browser sees a single
  origin (no CORS in normal use, no URL baked into the image).

## Repository layout

| Path | What |
|---|---|
| `frontend/` | React 19 + Vite SPA, nginx config (`nginx.conf`), its `Dockerfile` |
| `frontend/src/api/` | The only place HTTP happens: axios instance (`client.js`), TanStack Query hooks (`queries.js`), query keys, board cache (`boardCache.js`, `QueryProvider.jsx`), settings sync (`useSettingsSync.js`, `settingsMapping.js`) |
| `frontend/src/store/` | Redux Toolkit slices (`authSlice`, `tiersSlice`, `focusSlice` = player queue, `namingSlice`, `appearanceSlice`, `viewSlice`, `addSongsSlice`, `transfersSlice`) and memoized cross-slice `selectors.js` |
| `frontend/src/components/` | Pages and widgets (`TierBoardView`, `TierFocusView` = tier page, `TierRail`, `PlayerDock`, `QueuePanel`, `PendingChanges`, `Sidebar`, `HomeView`, `AddSongsView`, `SettingsView`, `CommandPalette`, ...); `components/duel/` = duel hub, matchup, moves, summary |
| `frontend/src/layout/` | Shell spacing tokens, the canvas scroll container, board-fit maths, resizable sash |
| `frontend/src/keyboard/` | Vim/VS Code keys: `g`-sequences, link hints (`f`), workbench keys |
| `frontend/src/duel/` | Duel UI helpers only (clip windows, text, matchup fit) - no ranking logic |
| `frontend/src/*.js(x)` (root) | Pure logic modules with tests next to them: `naming.js`, `tiers.js`, `tierLabels.js`, `todoLists.js`, `syncPlan.js`, `transfers.js`, `boardRename.js`, `queueTimeline.js`, `shortcuts.js`, `themes.js`, `settings.js` (device prefs), `tierActions.jsx` (every tier edit), `songMenu.jsx`, `boardMenu.jsx`, `upLevel.js` |
| `backend/src/main/java/fm/tierlist/` | `config/` (security, YouTube HTTP client), `controller/` (YouTube proxy endpoints, batch runner, error mapping), `settings/`, `user/`, `duel/` (+ `duel/engine/`, plain Java) |
| `backend/src/main/resources/db/migration/` | Flyway migrations (`V1__schema.sql`, `V2__activity_item_duels.sql`) |
| `scripts/` | `deploy.sh` (test-gated deploy), `backup.sh`, `restore.sh` |
| `docker-compose.yml` / `docker-compose.dev.yml` | Self-host stack / live-reload dev stack |
| `docs/` | This file, `features.md`, `requirements.md`, `status.md`, `screenshots/` |

## Frontend

- **Routing** (React Router, `App.jsx`): `/` Home, `/add` Add songs, `/settings`,
  `/tier/:category` board, `/tier/:category/t/:tier` tier page,
  `/tier/:category/duel` hub, `.../duel/play/:sessionId` matchup, `.../duel/moves`
  suggested moves, `.../duel/done/:sessionId` summary, `/playlist/:id` (redirects to
  its tier page), anything else -> `/`. All under the optional base path.
- **Shell**: `Layout` is a full-height column - activity bar + side panel | canvas
  (`<main>`, the scroll container) | Tier Rail - above the player dock's row. The dock
  and its queue are mounted once here and survive every navigation.
- **Server state** = TanStack Query (`api/queries.js`); **client state** = Redux. The
  playlists query is mirrored into `authSlice`; a board's playlist-item queries are
  loaded into `tiersSlice` as an editable draft (`useLoadTierBoard`, guarded by
  `loadedCategory` so a remount never discards unsynced edits).
- **Board cache**: playlists and playlist items are persisted to IndexedDB for 7
  days and shown instantly on the next visit, then refreshed in the background
  (rules in `api/boardCache.js`; details in CLAUDE.md).
- **PWA**: `vite-plugin-pwa` (manifest, auto-updating service worker that never
  answers `/api`, `/oauth2`, `/login/oauth2` navigations from the app shell).

## Main flows

### Login

1. "Continue with Google" -> `/oauth2/authorization/google` (proxied) -> Google
   consent (scopes `openid`, `profile`, `youtube.force-ssl`).
2. Google redirects to `<TIERLIST_URL>/login/oauth2/code/google`; Spring Security
   stores the token in the **in-memory HTTP session**, the success handler upserts the
   `app_user` row (Google `sub` as id) and redirects to `TIERLIST_URL`.
3. The SPA calls `GET /api/auth/status` (public) -> `{ loggedIn, userId }`. A signed-out
   `/api/**` call gets a 401 ProblemDetail, never a redirect.
4. A backend restart drops every session: everyone logs in again.

### Opening a board

1. `GET /api/playlists` (all of the account's playlists, paged by the backend).
2. The frontend parses titles with the user's naming (`naming.js parseTitle`) and
   groups matching playlists into boards (`{category}`) and tiers (`{tier}`); to-do
   lists are matched literally or by an explicit link. Non-matching playlists are
   dropped from every UI surface.
3. `GET /api/playlists/{id}/items` for each tier playlist of the board (parallel),
   loaded into `tiersSlice`. Duplicates are detected and staged automatically.

### Editing and pushing

1. Every edit (drag, menu, chip, rail, player rating, duel Move) goes through
   `tierActions.jsx` -> `tiersSlice` (undo/redo stack, 50 steps). Moves, removals,
   duplicate removals and cross-board transfers are derived as *pending changes*
   (`selectors.js`).
2. **Push** (`Shift+P`) builds a plan (`syncPlan.js`) and `POST /api/tier-sync`: for
   each row the backend inserts the video into the target playlist **then** deletes
   the old playlist item (a failed delete never loses a song); `toPlaylistId: null`
   means delete only. Rows run through `YoutubeBatch` (4 at a time, one at a time per
   target playlist, results in input order). Per-item results; the touched playlists
   are refetched.
3. **Within-tier order is not pushed**: the insert has no position (YouTube appends),
   and reorders only change the local draft. See `docs/status.md` (open question).

### Duels

1. The hub calls `POST /api/duels/{board}/analysis` with the board layout as the
   browser has it (staged edits included, to-do list included so it can be left out).
2. `DuelService` loads the account's duel history for that board and runs the engine
   (`fm.tierlist.duel.engine.DuelEngine`): priors from current tiers, Weng-Lin
   Bradley-Terry ratings, a Davidson-Bradley-Terry refit of the whole log, ordinal
   probit tier probabilities, pairing strategies, suggestion rules.
3. A session (`POST .../sessions`) serves pairs; verdicts / skips / undo / end are
   POSTs on the session. Suggested moves are accepted (Move -> staged + pushed to
   YouTube at once for just that song), kept or locked (`PUT/DELETE .../decisions`,
   `.../locks`).
4. Scores are never stored: they're rebuilt from priors + log on every analysis.

### Settings

`GET /api/settings` (with `ETag` = row version) on login; changes are debounced and
`PUT` with `If-Match` (or `If-None-Match: *` for the first save). A 412 means another
device saved first: refetch, three-way merge (`rebase()`), save again.

## HTTP API

All under `/api`, all require login except `auth/status`. Errors are RFC 9457
`application/problem+json`. YouTube errors are mapped by `YoutubeErrorHandler`
(quota -> 429, expired login -> 401, missing YouTube scope -> 403, else 502).

| Method + path | Does | YouTube quota |
|---|---|---|
| `GET /auth/status` | `{loggedIn, userId?}` | - |
| `POST /auth/logout` | Ends the session (200) | - |
| `GET /playlists` | Every playlist of the account (`id, title, thumbnail, itemCount`) | 1 / 50 playlists |
| `GET /playlists/{id}/items` | A playlist's videos (playlist-item id, video id, title, channel, thumbnail) | 1 / 50 items |
| `GET /videos/{videoId}` | One video's details (Add songs); 404 if missing/private | 1 |
| `POST /playlists/{id}/items` | Add one video (Add songs); returns the new item | 50 |
| `DELETE /playlist-items/{itemId}` | Remove one item (Add songs undo) | 50 |
| `POST /tier-sync` | Push: `[{videoId, fromItemId, toPlaylistId?}]` -> per-item results | 50 insert + 50 delete per move |
| `POST /playlists/rename` | `[{id, title}]` - board rename (reads the snippet first so only the title changes) | ~51 per playlist |
| `POST /playlists/create` | `[{title, privacyStatus?}]` - new board / missing tiers / to-do list (private by default) | 50 per playlist |
| `GET /settings`, `PUT /settings` | The account's settings row (conditional writes, see above) | - |
| `POST /duels/{board}/analysis` | Certainty, score map, suggestions, leaning, tier orders | - |
| `POST /duels/{board}/sessions` | Start a session (focus, minutes) | - |
| `POST /duels/{board}/sessions/{id}` | The session as it stands + next duel (resume) | - |
| `POST /duels/{board}/sessions/{id}/verdicts` \| `/skips` \| `/undo` \| `/end` | Record / undo / finish | - |
| `PUT\|DELETE /duels/{board}/decisions/{videoId}` | Accept or keep a suggested move / take it back | - |
| `PUT\|DELETE /duels/{board}/locks/{videoId}` | Lock a song in its tier / unlock | - |
| `POST /duels/{board}/rename` | Move a board's duel history to its new name after a rename | - |

The default YouTube Data API quota is 10,000 units/day per Google Cloud project, shared
by every account using that instance's OAuth client. Reads are cheap; writes are 50
units each, so a push of 100 moves costs ~10,000 units.

## Data model (Postgres)

Flyway owns the schema (`V1__schema.sql` is applied on live data - never edit it; a
change is a new `V<n>__*.sql`). Closed option sets are native enums; no JSON columns.

| Table | Holds | Notes |
|---|---|---|
| `app_user` | One row per Google account that has logged in: `id` = Google `sub`, display name, picture, `created_at`, `last_login_at` | Written on every login (`AppUserService`) |
| `user_settings` | One row per account: `theme` / `accent` / `tier_palette` (enums `theme_option`, `accent_option`, `tier_palette_option`), `naming_template`, the six tier names `naming_tier_s..d/todo` and their optional "shown as" names `naming_tier_*_shown`, the seven nullable `naming_migrating_from*` columns (all or none), `version` (ETag), `updated_at` | CHECKs via SQL functions `tier_label_valid` / `tier_labels_distinct`; no row = never saved |
| `todo_list_link` | Hand-assigned to-do lists: `(user_id, playlist_id) -> category` | Part of the settings row (`@ElementCollection`); `SettingsService` force-increments the version when links change |
| `activity_bar_item` | The activity bar's icon order: `position -> item` (enum `activity_item`: HOME, JUMP, BOARDS, PLAYLISTS, ADD_SONGS, DUELS) | Part of the settings row; `UNIQUE (user_id, item)` deferred so in-place reorders pass; on the wire `appearance.activityOrder` |
| `duel_session` | One sitting: board, `focus` (enum `duel_focus`), minutes (1-60), start/end, certainty at start | `ONE_SONG` / `PLACE_TODO` labels, `song_id` column and its CHECK are retired leftovers |
| `duel` | One verdict: `video_a`, `video_b`, `verdict` (enum `duel_verdict`: A_CLEARLY, A, TOO_CLOSE, B, B_CLEARLY, from A's side) | The append-only log - the source of truth for every score |
| `duel_skip` | "Don't know one of them": video skipped for the rest of a session | |
| `duel_prior` | A song's starting score `(mu, sigma)` from the tier it was in | Remade when the song changes tier |
| `duel_decision` | The user's answer to a suggestion (`ACCEPTED` / `KEPT`), confidence, duels at the time | One per song; pending suggestions are derived, never stored |
| `duel_lock` | Songs never to be suggested | |

Boards are identified by name (the `{category}` text), songs by YouTube video id
(11 chars, CHECKed). Everything is keyed by `user_id`, so accounts never see each
other's data.

What is **not** in Postgres: playlist contents (YouTube), OAuth tokens and sessions
(backend memory), per-device UI prefs (browser localStorage), the board cache
(browser IndexedDB).

## Deployment topology

`docker-compose.yml` (project name `tierlistfm`): `db` (postgres:17-alpine, data in
the `pgdata` volume or `DB_DATA_LOCATION`), `backend` (no host port), `frontend` (nginx,
the only published port, `TIERLIST_PORT`), `backup` (nightly `pg_dump`). Every value
comes from `.env` (documented in `.env.example`); self-host steps, reverse-proxy and
sub-path setup are in the README. `docker-compose.dev.yml` mounts the source for live
reload and also publishes the backend on `48123`.
