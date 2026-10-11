# Tierlist.fm

A personal tool to log into your own YouTube account, browse playlists, and manage a
custom tier-list system. Playlists whose names follow the user's naming template
(`{category} {tier}` by default, e.g. `Rap S`) are auto-grouped into a tier board per
category.

## Stack

- **Frontend**: React 19 + Vite, in `frontend/`.
  - **Mantine** (`@mantine/core`, `@mantine/hooks`, `@mantine/spotlight`) is the UI
    component library - this is the final choice after trying MUI (rejected up front,
    too Material-flavored), then Tailwind+shadcn/ui (rejected, shadcn is copied-in
    scaffold code not a real dependency), then Tailwind+Radix UI (rejected in favor of a
    single full component library rather than utility CSS + headless primitives). Use
    Mantine's own components (`Tabs`, `Modal`, `Select`, etc.) for anything new/touched
    instead of hand-rolling equivalents.
  - **Every color is a variable, defined in exactly one place: `src/themes.js`.** It
    holds the `THEMES` (3 dark + 3 light chromes), `ACCENTS` (8 most popular, usable with any theme; most reuse Mantine's own default palettes),
    `TIER_PALETTES` (3), `MEDIA` (colors drawn over art/video) and `DEMO_ART`. The user
    picks theme/accent/tier palette in Settings -> Appearance (`appearanceSlice`,
    persisted per account in Postgres - see the Database bullet). `buildAppearance()` turns the choice into CSS variables
    on `<html>` (`--bg`, `--editor` (the page card, also Mantine's body color) and the `--chrome*` shell tokens (`--chrome`, `--chrome-border`, `--chrome-fg-muted`, `--chrome-hover`, `--chrome-selected`, `--chrome-input*` - derived from the theme by VS Code's Dark/Light Modern ratios, see the comment in `buildAppearance`), `--surface*`, `--border*`, `--text*`, `--accent*`, `--shadow`,
    `--overlay`, `--tier-s..d` + `--tier-todo`, `--tier-ink`, `--media-*`) plus the Mantine theme;
    `AppearanceRoot.jsx` wraps `MantineProvider` and re-applies both live.
    `cssVariablesResolver` points Mantine's own color variables at ours and
    `variantColorResolver` picks readable text on filled accent/tier colors - so there
    is one set of color variables, and Mantine reads it.
  - **Never hard-code a color** in a component or `App.css` - use `var(--token)`,
    `TIER_COLORS` / `TIER_INK` (which are themselves `var(--tier-*)`), or Mantine color
    props (`c="dimmed"`, `color="gray"` - never `dark.N`, which breaks light themes).
    A genuinely new color means a new token in `themes.js` (+ its fallback in
    `index.css :root`), not a literal. SVG icon props (`fill`/`color`) can't read CSS
    variables - use `currentColor` and set `color` via `style`.
  - `src/index.css :root` only holds *fallback* values for those tokens (the default
    Graphite theme, for the instant before `themes.js` runs) plus font/radius tokens;
    the pre-Mantine hand-written `App.css` reads the same variables. Don't add new hand-written CSS classes
    there for anything a Mantine component could do instead; convert an existing class
    to Mantine opportunistically when already touching that component, but there's no
    standing task to rewrite all of `App.css` at once.
  - The command palette (`CommandPalette.jsx`) is Mantine's `Spotlight` - it owns its
    own Cmd/Ctrl+K shortcut and open/close state internally (via the `spotlight` object
    from `@mantine/spotlight`), so don't reintroduce a manual keydown listener or Redux
    state for "is the palette open."
  - **Redux Toolkit** (`@reduxjs/toolkit` + `react-redux`) for *client* state only, in
    `frontend/src/store/` (`authSlice` mirrors login/playlists, `viewSlice`,
    `tiersSlice` - the local editable draft over a board's data - and `focusSlice`).
    Cross-slice derived values (pending moves, duel pools, focus navigation sequence,
    etc.) are memoized selectors in `store/selectors.js`, not component-level `useMemo`.
  - **TanStack Query** (`@tanstack/react-query`) is the primary data-fetching layer for
    *server* state - all API reads/writes go through hooks in `frontend/src/api/queries.js`
    (`usePlaylistsQuery`, `useTierBoardQueries`,
    `useTierSyncMutation`, ...), never a raw `fetch`/`axios` call inline in a component.
    **axios** (`frontend/src/api/client.js`'s `api` instance) is the HTTP transport
    underneath it, not a separate calling convention - nothing outside `src/api/` should
    import axios directly. Playlists/login state is mirrored from its query result into
    `authSlice` via a `useEffect` (selectors elsewhere in the app read Redux, not the
    query cache, to avoid rewriting them) - see `App.jsx`'s top-level `App()` component
    and the `useLoadTierBoard` hook for the pattern.
    **Board cache (persistence):** `api/QueryProvider.jsx` is TanStack Query's
    `PersistQueryClientProvider` with `@tanstack/query-async-storage-persister` over
    `idb-keyval` (IndexedDB) - no hand-rolled IndexedDB code. `api/boardCache.js` owns
    the rules: `shouldDehydrateQuery` persists **only** `playlists`, `playlist-items`
    and `cache-owner` (keys in `api/queryKeys.js`) - big boards open instantly, since
    YouTube's playlist-items reads are slow. Never persisted: mutations, settings (the
    account's row wins), duel analysis/sessions (Postgres, must be fresh), auth status.
    `buster` = `BOARD_CACHE_SCHEMA` (bump it when cached data's shape changes), `maxAge`
    7 days, those queries' `gcTime` >= maxAge (`configureBoardCache`). It belongs to
    one account: `/api/auth/status` returns `userId`, and `useAuthStatusQuery`'s
    queryFn calls `claimBoardCache` *before resolving*, dropping every cached read if
    the owner differs (or is unknown); logout calls `clearBoardCache`. Restored data
    predates `SESSION_START`, so the `staleTime` function (`staleUnlessFromCache`,
    `api/queryClient.js`) makes only it stale -> shown at once, refetched in the
    background; data fetched this session stays `Infinity` (quota). A board loaded
    from such data sets `tiersSlice.awaitingRefresh`; `landBoardRefresh`
    (`tierActions`) applies the fresh copy **once, and only if `selectHasLocalEdits`
    is false** (no undo steps / staged moves / sync in flight) - never a later
    refetch, which can lag behind a sync. A failed refresh keeps the board with a
    quiet notice (`refreshError`). No IndexedDB -> plain `QueryClientProvider`.
    `useTierBoardQueries` waits on `isPending` (not `isLoading`): during restore
    nothing fetches, and `isLoading` "loaded" empty tiers.
  - **React Hook Form** (`react-hook-form`, installed) - there is currently no real form
    in this app for it to manage (login is a plain OAuth redirect; filter/search/settings
    inputs are simple controlled inputs with no validation need). Don't force it in
    somewhere it doesn't fit; use it if/when a real form with validation appears.
  - **Shell spacing is one standard: `src/layout/spacing.js`** (Mantine spacing
    keys - `SHELL_Y` top/bottom of every shell column, `SIDEBAR_X`/`CANVAS_X`/
    `RAIL_X` sides, `PART_GAP` the 8px gap around the page card). Resizable
    edges are `layout/Sash.jsx` (react-resizable-panels `Separator` + grip). Sidebar, canvas and rail pass these to Mantine `p*` props;
    layout maths reads them via `spacingPx()`. Don't hand-pick a padding number
    for a shell column - change the token.
  - **Spacing and type are scales, never raw px** (the user's call: "variable the
    thing", VS Code density). Every margin/padding/gap is a key of `themes.js`
    `SPACING` (`5xs` 2 · `4xs` 4 · `3xs` 6 · `2xs` 8 · `xs` 10 · `sm` 12 · `md` 16
    · `lg` 20 · `xl` 32 · `2xl` 40 · `3xl` 48 · `4xl` 64 · `5xl` 80) and every font
    size a key of `FONT_SIZES` (`2xs` 10 · `xs` 11 · `sm` 12 · `md` 13 body · `lg`
    14 · `xl` 16 · `2xl` 20 · `3xl` 26 · `4xl` 32); both are in the Mantine theme,
    so props take the key (`gap="2xs"`, `fz="sm"`) and CSS reads
    `var(--mantine-spacing-*)` / `var(--mantine-font-size-*)`. `<Title>` takes its
    size from `HEADING_SIZES` (h1 page title 26, h2 section 16) - no `fz` on it.
    Default Button/Input height is 30px (`CONTROL`); don't use `size="lg"` for
    ordinary page actions. A new value means a new key, not a literal. Exempt:
    intrinsic sizes (icon `size`, tile/thumbnail `w`/`h`), sizes derived from the
    tile size, and geometry (centering offsets, hairlines).
  - **One button system** (the user's call: "fix CSS, buttons and UIs" - three
    looks side by side read as foreign). Four kinds, plain Mantine props:
    **primary** = Mantine's default (filled accent), at most one per view;
    **secondary** = `variant="default"`; **quiet** = `variant="subtle"
    color="gray"` (Reset, Add missing tiers, low-weight links); **danger** =
    `variant="light" color="red"`. No accent `variant="light"` buttons and no
    `color="dark"`. **Order: lightest first, the primary last (rightmost)** -
    page actions go in `PageHeader`'s `actions` slot, pairs read Keep / Move,
    Cancel / Create, Reset / Save. Size: the default (30px) for page and dialog
    actions, `compact-sm` inside cards, alerts, toasts and dense rows. Gray
    light/subtle tints are a `--text` wash (`cssVariablesResolver`) - Mantine's
    own `darken(shade 9)` made them black in dark themes.
  - **Every page header is `components/PageHeader.jsx`** (the user's call: spacing
    "coherent across pages"): eyebrow-or-crumb slot, optional badge, the h1 title,
    meta line, actions top-aligned with the title - so titles and first content line
    up page to page. Under it and between a page's sections: `SECTION_GAP`
    (`layout/spacing.js`). Pages are full width (duel pages too: `Container fluid`),
    never their own centred max-width column.
  - **Right-click menus are `mantine-contextmenu`** (`ContextMenuProvider` in
    `AppearanceRoot`, `useContextMenu()`), chosen over react-contexify / Radix
    because it's built on Mantine and follows the theme. The song menu's items
    are defined once as data in `src/songMenu.jsx` (`songMenuGroups`) and drawn
    by both the `...` button (`MoveMenu`, Mantine `Menu`) and right-click
    (`useSongContextMenu`) - add a song action there, never in one of them.
  - `lucide-react` is available for icons - prefer it over new unicode/emoji glyphs
    where a component is otherwise being touched.
  - **Mantine's `Skeleton`** for loading placeholders (tier board thumbnails, playlist
    cards) - don't hand-roll a shimmer div/CSS animation for a new loading state, use
    `<Skeleton>` and only add layout-sizing CSS (width/aspect-ratio) it has no prop for.
  - **`@bprogress/react`** (`ProgressProvider` mounted once in `main.jsx`, `useProgress()`
    elsewhere) drives the slim top-of-page progress bar. It's manually driven
    (`start()`/`stop()`), not the router-integrated mode, since what it currently tracks
    is `useLoadTierBoard`'s own loading state, not raw route navigation - wire new pages'
    async loads into it the same way rather than adding a second, differently-styled
    loading indicator.
- **Backend**: Spring Boot 3 (Java 21, Maven), in `backend/`. Session-based Google OAuth2
  login; talks to the YouTube Data API v3 directly (no separate token DB).
- **Database**: **Postgres 17** (the `db` compose service, data in the `pgdata`
  volume), accessed via **Spring Data JPA**, schema owned by **Flyway**
  (`backend/src/main/resources/db/migration/V*__*.sql`; Hibernate is `ddl-auto:
  validate` only). **Proper typed schemas, no JSON/`jsonb` blob columns, and every
  closed option set is a native Postgres `ENUM`, never a free VARCHAR** (the user's
  explicit calls). **`V1` is applied on the live database with real data**: never
  edit an applied migration (Flyway's checksum check fails the boot) and never
  reset the volume - a schema change is a new `V<n>__*.sql`. Back up first
  (`scripts/backup.sh`).
  Tables: `app_user` (Google `sub` as id, recorded on every login by the success
  handler in `SecurityConfig`) and `user_settings` (one row per user: `theme_option`,
  `accent_option`, `tier_palette_option` enums, the naming
  template and the six tier names `naming_tier_s..d/todo` - plus the same seven
  nullable `naming_migrating_from*` columns for an unfinished rename, all or none -
  (+ CHECK constraints via the `tier_label_valid` / `tier_labels_distinct` SQL
  functions) and a `version`), `todo_list_link`
  (playlist id -> board, part of the settings row: an `@ElementCollection` excluded
  from Hibernate's auto-versioning - it bumped the version on insert - so
  `SettingsService` force-increments when links change), and `activity_bar_item`
  (the activity bar's icon order: `position` SMALLINT -> `item`, the `activity_item`
  enum, `UNIQUE (user_id, item)` deferred so in-place reorders pass; also part of the
  settings row, an `@ElementCollection` `List<ActivityItem>` + `@OrderColumn`, versioned
  the same way as `todo_list_link`; on the wire `appearance.activityOrder`, frontend
  ids, missing/partial -> completed in default order, duplicates/unknown -> 400;
  frontend `activityOrder.js` + `appearanceSlice` `setActivityOrder` /
  `selectActivityOrder`). Backend package
  `fm.tierlist.settings`, layered and SOLID:
  - enums `Theme`/`Accent`/`TierPalette`: constant name = Postgres
    enum label (Hibernate `@JdbcTypeCode(SqlTypes.NAMED_ENUM)` + `columnDefinition`
    naming the type so `validate` matches), `@JsonValue key()` = the frontend's id
    (`tokyo`, `vivid`) - the API speaks frontend keys, the DB its labels;
  - `@Embeddable` records `Appearance`/`Naming` (same grouping as the Redux
    slices) inside the `UserSettings` entity; `SettingsDto` is the separate wire
    contract with `from()`/`toX()` conversions (the DTO depends on the domain, never
    the reverse); unknown JSON properties are ignored (Boot's Jackson default), so
    an older tab still sending the retired `prefs` group saves fine;
  - `@NamingTemplate` is a Bean Validation constraint mirroring `naming.js`
    `validateTemplate` - keep the two grammars in step;
  - `SettingsController` (thin, HTTP only) -> `SettingsService` (transactions, rules)
    -> `UserSettingsRepository`;
  - **conditional writes** (RFC 9110): the row's `@Version` is its `ETag`; a PUT must
    send `If-Match: "<version>"` or `If-None-Match: *` (first save) - the sealed
    `WritePrecondition` - else 428; stale -> 412 (`SettingsConflictException`, also
    for lost `@Version`/insert races via `SettingsExceptionHandler`). Errors are
    RFC 9457 ProblemDetail (`spring.mvc.problemdetails.enabled`).
  Adding a setting: column (or enum type + column) in the migration, field in the
  right embeddable + `SettingsDto`, one entry in the frontend's
  `api/settingsMapping.js` `SCHEMA`. Adding an *option* (new theme etc.): enum label
  in the migration, Java constant, and the frontend catalogue entry - the three
  must match or the API rejects it (400).
  Frontend side: `api/useSettingsSync.js` (called in `App()`) loads the row into the
  `appearance`/`naming` slices via the `settingsLoaded` action, uploads this
  browser's settings when the account has no row yet, PUTs changes (debounced, one
  in flight) and on 412 refetches and `rebase()`s (three-way merge: this browser's
  edits on top of the newer row). localStorage (`settings.js`) is only a boot cache
  so the theme applies before first paint - the account's row wins.
- **Per-device UI prefs vs account prefs.** Account prefs (theme/accent/tier
  palette, naming, to-do links, activity order) live in Postgres (`user_settings`);
  `settings.js` `SETTINGS` is only their boot cache - never duplicate one as a
  device pref. Per-device UI state (side panel shut/view, player volume/mute and
  repeat, duel session length, Add songs' last board) lives only in this browser's
  localStorage, declared once in `settings.js` `DEVICE_UI` (`{ key, fallback,
  parse }`; synchronous, guarded, invalid -> default); the side panel's width is
  react-resizable-panels' `useDefaultLayout` through `layoutStorage`. Adding one:
  a `DEVICE_UI` entry, then `useDevicePref(name)` for component state, or for Redux
  state `readDevicePref(name)` in the slice's (function) initial state + one
  `DEVICE_PREF_SOURCES` line in `store/store.js`. Never call `localStorage` or
  Mantine's `useLocalStorage` directly elsewhere. Don't persist search text,
  selections, modals, the queue or server data. Boot runs `cleanStorage()`: a key
  a feature stops reading goes on `RETIRED_KEYS`.
- **Duels: the algorithm lives only in the backend, in `fm.tierlist.duel.engine`**
  (the user's call: "the algorithm logic should be in our backend", its own package).
  Plain Java - no Spring/JPA/HTTP imports there - built from swappable parts (Strategy
  pattern) behind the `DuelEngine` facade (`DuelEngine.builder()`): `RatingModel`
  (`WengLinBradleyTerry`, OpenSkill's model implemented from the paper - no
  third-party rating lib), `Refitter` (`DavidsonBradleyTerryRefit`, run over the
  whole log on every analysis), `PriorPolicy` (`TierPriorPolicy`: a song starts from
  the tier it's in), `TierModel` (`OrdinalProbitTierModel`, Commons Math),
  `pairing.PairingStrategy` per `Focus` (registry `PairingStrategies`; the focuses
  are `SMART_MIX`, `PLACE_TODO`, `BORDERLINES` - the "One song" mode was removed,
  the user's call), and
  `policy.SuggestionPolicy`, a composite of `SuggestionRule`s (the 85% / 4 duels /
  2 border opponents gate, Keep hysteresis, locks). Tunables: `EngineConfig`. The duel
  log is the source of truth (event sourcing): scores are always rebuilt from priors +
  log, never stored. `fm.tierlist.duel` is the layered rest: entities/repositories on
  the `duel_session`, `duel`, `duel_skip`, `duel_prior`, `duel_decision`, `duel_lock`
  tables (V1), `DuelService` (history in, engine, results out), `DuelController`
  (`/api/duels/{board}/...`; reads are POSTs carrying the browser's board layout,
  staged edits included). The frontend's duel screens (`components/duel/`) only show
  what the API returns - add ranking logic to the engine, never to the frontend.
  Every duel/user datum lives in Postgres (the user's call), not localStorage.
  **To-do songs only come up in a Place TODO session** (the user's call: they "aren't
  done yet") - Smart mix, Borderlines and every opponent are ranked songs.
  **Retired schema bits, drop at the next schema reset:** V1 still has the
  `ONE_SONG` label in the `duel_focus` enum, the nullable `duel_session.song_id`
  column and its `session_song_for_one_song` CHECK. They're harmless (nothing
  writes them; `DuelSession` no longer maps `song_id`), and V1 is applied on the
  live DB, so they're left in place rather than editing the migration.
- **Backend tests**: `mvn verify` - unit tests (`*Test`, surefire) plus
  Testcontainers integration tests (`*IT`, failsafe) against a real `postgres:17-alpine`
  (needs Docker; `testcontainers.version` is pinned in `pom.xml` because Boot 3.3's
  is too old for current Docker engines). New persistence/API behaviour gets an IT,
  not a mock. The Docker image build skips tests.
- **Frontend tests**: `npm test` in `frontend/` (Vitest + Testing Library, jsdom;
  `vitest.config.js`, test files next to their module as `*.test.js(x)`). Pure logic
  lives in plain modules so it can be tested without React - e.g. the board rename
  plan is `src/boardRename.js`, the component only calls it. A bug fix comes with a
  test that fails without it.
- **Tests gate every deploy (the user's explicit call).** Deploy only via
  `scripts/deploy.sh` (all tests + build, then Compose, then checks the served
  bundle) - `scripts/deploy.sh frontend` for a frontend-only redeploy that keeps
  the login. Never run `docker compose up --build` by hand to ship a change, and
  never report a fix as live if the script failed. No CI pipeline (the user's
  call) - the tests run locally. The backend must keep >= 80% line coverage
  (JaCoCo, enforced by `mvn verify`).
- **Deploy**: Docker Compose. `docker-compose.yml` (prod-style multi-stage builds) and
  `docker-compose.local.yml` (dev, volume-mounted). Rebuilding either container clears
  the backend's in-memory session, so you'll need to log in again after a redeploy.
- **Backups**: the `backup` Compose service (`prodrigestivill/postgres-backup-local:17`)
  dumps `db` nightly into the gitignored `./backups/` (`daily/`, `weekly/`, `monthly/`,
  `last/`; 7/4/6 kept; runs as `BACKUP_UID`/`BACKUP_GID` from `.env`). `scripts/backup.sh`
  takes one now (`backups/manual/`, gzipped plain SQL), `scripts/restore.sh <dump>` restores
  one (type-the-project-name confirmation, fresh backup first, backend stopped, single
  transaction), and `scripts/deploy.sh` runs `backup.sh` before deploying when `db` is up.
  Use these instead of hand-made CSV/pg_dump copies before a schema reset.

## Conventions / decisions worth knowing

- **Default look: Tokyo Night theme + Blue accent + Vivid tiers**, user-switchable in
  Settings -> Appearance (see the themes.js bullet above). Accents offered by default
  stay outside the tiers' red -> blue ramp so buttons don't read as tiers.
- **No MUI, no Tailwind, no shadcn/ui, no bare Radix.** All considered and explicitly
  rejected in favor of Mantine as a single, final UI library choice - see git history
  around the frontend stack migration for the reasoning behind each.
- **A failed load must say why, never skeleton forever.** YouTube API errors
  come back as ProblemDetail from `YoutubeErrorHandler` with a plain-language
  `detail` (quota -> 429, login expired -> 401, missing YouTube scope
  `insufficientPermissions` -> 403 "log in again and tick the YouTube
  permission", else 502); `errorMessage()` in `api/client.js` reads it. Home
  shows a playlists-load failure as an error card with Log in again / Retry
  (`HomeView` `loadError`). A new page that loads data needs the same.
- **Ranks are positions.** A playlist can hold the same video twice, so a
  row's number is its index (`i + 1`), and list keys include the index -
  never a `videoId -> rank` map, which gave both copies the last one's number.
- **Duplicate videos are auto-resolved, not flagged for the user to decide.** If the same
  video exists in two of a board's real tier playlists, the highest-tier copy is kept and
  every other copy is automatically staged as a pending removal (shows in the "N pending"
  popup as `tier → removed (duplicate)`). No manual dedupe UI.
- **The embedded video player must never be unmounted/remounted just to change its
  layout.** `PlayerDock` renders in `expanded` (full-screen) or `mini` (bottom bar,
  YouTube-Music-style) mode via CSS class changes on the same DOM shape - never via
  conditionally mounting/unmounting the player subtree - so minimizing never
  interrupts playback.
- **The player dock is global and navigation-independent.** It's mounted once in the
  router `Layout` (above `<Outlet/>`), and no route/page effect ever dispatches
  `closeFocus` on mount - only its own "stop" control (and logout) does. Don't
  reintroduce a "close the player when navigating away" call; that defeats the whole
  point of a background-playback mini bar. Also don't derive the *playing* video's
  data from `state.tiers.tierItems` (live, current-board-only) - `focusSlice.focusEntries`
  is a snapshot of `{tier, video}` taken when the dock opens/shuffle starts, and
  `selectActiveSequence` reads from that snapshot instead. This was a real bug, not
  just theoretical: navigating to a different tier board replaces `tierItems`, so a
  selector chain rooted in it loses the still-playing video and the dock silently
  unmounts mid-navigation - the snapshot is what actually makes the dock global.
- **The dock takes real layout space - never overlay it and offset things.** `Layout`
  is a `100dvh` column: a body row (`Sidebar` | scrolling `<main>` canvas | `TierRail`)
  above the mini dock, which sits in normal flow as the last row. Nothing is
  `position: fixed` against the bottom, and nothing measures the dock's height (the old
  `--player-dock-height` variable undercounted and cut the rail off). The canvas, not the
  window, is the scroll container - use `useCanvas()` (`layout/canvas.js`) to measure or
  scroll it. Overlays that must float above the dock (staged-changes bar, mobile drawer)
  are `position: absolute` against the body row.
- **Real Document Picture-in-Picture doesn't work for the YouTube iframe embed** -
  moving it into a separate top-level browsing context makes YouTube's embed treat it
  as an unauthorized origin and refuse to play ("owner has disabled embedding"),
  regardless of the video. `PlayerDock`'s "floating corner" button is a CSS-only
  restyle of the mini bar into a small fixed box in the bottom-right corner (like
  YouTube Music's in-app miniplayer) - nothing is ever moved to another window/
  document. Don't reintroduce `window.documentPictureInPicture`.
- **Routing is React Router** (`react-router-dom`), not hand-rolled History API calls -
  see `App.jsx`. `tiersSlice.loadedCategory` guards `TierBoardPage`/`DuelPage` against
  re-fetching a board that's already loaded when the router remounts the page (e.g.
  returning from a duel) - removing that guard would silently discard an unsynced duel
  result or drag on every board/duel round-trip. Don't refetch tier-board data on mount
  without checking `loadedCategory` first.
- **Playlist names follow the user's naming (`src/naming.js`, `namingSlice`) = template
  + tier names.** The product knows exactly two tokens, `{category}` and `{tier}`; any
  other `{word}` in the template is a token *of the user's own*, named by them (e.g. `{my_label}` for
  `[Chill] Rap S`) - free text read from each title into `parsed.fields` and written back
  unchanged, with no meaning to the app. Never build a user's personal convention into
  the product (no built-in or detected token names, no `[G]` examples; `detectNaming` only tries the presets + the user's own current template) - the user's explicit call.
  **Tier ids are `S A B C D` + `TODO`** (`tiers.js`), fixed internal slots that colors
  (`--tier-s..d`), the rail, duels and shortcuts key on. What each is *called* is the
  user's choice: `naming.tierLabels` = the name in playlist names (default `S A B C D` /
  `TODO`; e.g. `T1..TZ` / `(**TODO**)`, matched exactly), `naming.tierDisplayNames` =
  optional "shown as" per tier (null = the name; backend `naming_tier_*_shown`), used
  **everywhere on screen**: render a
  tier's name with `useTierName()` / `tierName()` (`src/tierLabels.js`) or `TierChip`,
  never the raw id. Never hard-code a tier name like `T1`. No legacy/back-compat
  labels (the user's call): no saved tier names -> defaults + first-run detection
  (`detectNaming`, which tries the typed-in names and the `TIER_LABEL_PRESETS`).
  **Settings -> Playlist naming never renames anything** (the user's call): it only
  decides which playlists are tier playlists (a live "Matching playlists" preview +
  Save). `migratingFrom*` (a previous naming still recognised) stays in the state /
  schema but nothing in that page sets it any more.
  Never parse playlist titles with an ad-hoc regex - use `parseTitle`/`renderTitle`,
  and read playlists through `selectTierPlaylists` (template-matching only, each with
  `.parsed`), never `state.auth.playlists` directly in UI: non-matching playlists are
  deliberately invisible everywhere (privacy). Renames/creates go through
  `/api/playlists/rename` / `/api/playlists/create` (per-item results).
- **Every tier edit goes through `src/tierActions.jsx`** (`moveWithFeedback`,
  `applyOrderWithFeedback`, `undoEdit`, `useTierDnd`) - never dispatch
  `moveVideoToTier`/`moveVideos` directly from a component. That's what gives every
  surface the same undo toast, the same Ctrl+Z step (`tiersSlice.undoStack`), and keeps
  the player's `focusedVideo.tier` in sync after a move.
- **The tier list is the product's moat** (see `PRODUCT.md`): the Tier Rail
  (`TierRail.jsx`) is always on board pages; board pages render inside `BoardShell`
  in `App.jsx` (rail + shared `PendingChanges` bar, which also owns Shift+P).
- **TODO is a special, unranked tier** (`tiers.js`: `TODO_TIER`, `BOARD_TIERS` =
  `TIER_ORDER` + TODO). Use `BOARD_TIERS` for what a board holds/loads/plays/moves
  between, `TIER_ORDER` for ranking only (duels, dedupe priority, "missing tiers",
  player Shift+digit rating). Triage (`focusSlice.isTriage`) auto-advances in
  `tierActions.moveWithFeedback` when the playing to-do song is rated.
  To-do lists **follow the naming** with the to-do tier's name
  (`tierLabels.TODO`, kept exactly as typed, symbols and all - e.g.
  `(**TODO**)`) in `{tier}`'s place (`todoTitle()`), and the rename job renames
  them too - the user's call: TODO *is* a tier type, just unranked.
  They're matched **literally, like any tier** (the user's call): `parseTitle`
  matches all six names in `{tier}`'s slot, so a to-do list is the template
  with the exact to-do name there - no keyword/fuzzy matching, symbols count.
  `src/todoLists.js` `resolveTodoLists`: an explicit link, else that literal
  name. Explicit links are `naming.todoLinks` (backend `todo_list_link`
  table). `selectTierPlaylists` merges them in with `parsed.tier = 'TODO'`;
  `selectTodoRows` lists every
  candidate (the board's "Add a to-do list" modal uses it; Settings has no to-do
  section - the user removed it). Keep `validateTemplate`/`@NamingTemplate` and
  `validateTierLabels`/`@TierLabel` + `TierLabelsDto.isDistinct` in step.
- **Duel ranking is the backend engine** (`fm.tierlist.duel.engine`, see the Duels
  bullet in the Stack section) - no ranking algorithm and no strategy setting on the
  frontend (the old Settings -> Duels "default strategy" was removed).
- Full feature list: `docs/features.md`. Keep it updated when you add a user-facing
  feature. It doubles as the no-regression checklist (the user asked for this) -
  before redesigning/rewriting any page, check every item listed for it (and the
  "Keyboard shortcuts" section) still works afterwards, and update the entries.

## Pending work (frontend stack migration, in progress)

The user asked for these on top of the Mantine/Redux migration above. Tracked here
(no task-tracking tool is available in this environment) - update as items land:

- [x] **React Router** - done. Real `Routes`/`Route`s (`/`, `/playlist/:id` - now only a redirect to
  that playlist's tier page `/tier/:category/t/:tier`, there's no separate playlist view -
  `/tier/:category`, `/tier/:category/duel`, `/settings`) replace the hand-rolled
  History-API routing. Also fixed a latent bug found while doing this: navigation
  used to unconditionally close the player dock, defeating the "plays in the
  background" point of the mini bar - navigation no longer touches it at all.
- [x] **TanStack Query + axios** - done. `frontend/src/api/` (`client.js`'s axios
  instance, `queries.js`'s hooks) is now the only place API calls happen; no
  component does a raw `fetch`. `itemsSlice` was removed entirely (and the old playlist
  page with it - a playlist opens its tier page); `tiersSlice.loadedCategory` mediates
  between TanStack Query's cache (pristine server data) and the local editable draft
  (drags, duel results) - see `useLoadTierBoard` in `App.jsx`. Don't refetch
  tier-board data on mount without checking `loadedCategory` first, and don't
  reintroduce a raw `fetch`/inline `axios` call in a component - add a hook in
  `api/queries.js` instead.
- [ ] **Replace hand-rolled UI code with Mantine / proven libraries** (the user,
  2026-10-10: "use the Mantine and other built-in things only, don't create your
  own when we have already tested solutions and libraries"). Audit the frontend
  for custom pointer/drag handlers, measuring code, keyboard listeners and CSS
  that Mantine (`@mantine/core`/`hooks`), `react-resizable-panels` (the sidebar
  split), `@tanstack/react-virtual`, `@hello-pangea/dnd` or another popular,
  maintained library already covers, and swap them over one at a time with
  tests. Done so far: the sidebar's resize edge (now `react-resizable-panels`);
  `PendingChanges` Shift+P (Mantine `useHotkeys`); the tier page's `/` and
  filter Escape (`react-hotkeys-hook` + Mantine `getHotkeyHandler`); the
  dock's progress polling (Mantine `useInterval`, `usePlayerTime.js`); the
  sidebar's spring-loaded board open (Mantine `useTimeout`); dead App.css
  rules (`appCss.test.js` now fails on any App.css class nothing uses).
  Left, each riskier than a one-for-one swap: the big page keydown handlers
  (`PlayerDock`, `TierBoardView` search, `AddSongsView` - capture phase,
  ordering with `keyboard/sequence.js` and `LinkHints` matters); `LinkHints`'
  while-open window listeners (could be `useWindowEvent`, same ordering
  caveat); `sequence.js`'s module-level listener (react-hotkeys-hook doesn't
  expose its pending-sequence state); native HTML5 drag-and-drop in
  `tierActions` `useTierDnd` / board / tier page / queue (`@hello-pangea/dnd`
  is installed, but the sidebar cross-board drop and the virtualizer drop
  slot depend on native drag events); `tierUtils.indexForPointInFlow` and the
  canvas-offset `getBoundingClientRect` reads in `TierBoardView` /
  `TierFocusView` (board fit maths, virtualizer `scrollMargin`); the dock's
  click-to-seek line (could be a Mantine `Slider`, but it's the dock's
  mini/floating CSS).
- [ ] **React Hook Form** - installed, still nothing to use it on (see Stack section
  above). Not a gap to close proactively.
- [~] **Stop hand-writing CSS, use Mantine components instead** - in progress, real
  ground covered but not finished. Done so far: every plain `<button className="btn
  ...">` across the app converted to Mantine `Button`/`ActionIcon`
  (`App.css`'s now-dead `.btn`/`.btn-primary`/`.btn-ghost`/`.sidebar-search`/
  `.duel-strategy-select` rules removed as each one emptied out), the sidebar filter
  input converted to Mantine `TextInput`, the duel-strategy dropdown to Mantine
  `Select`, the Settings duel-strategy picker to Mantine `Radio.Group` +
  `Radio.Card`, the tier board's thumbnail cards to Mantine `Card`/`Card.Section` +
  `Text` (truncated title) + `ActionIcon`/`Badge` (link/duplicate tag), the header/
  button-row layout on the tier board to Mantine `Group`/`Stack`/`Title`/`Paper`/
  `Badge`, and all of `Sidebar`'s structure to Mantine `NavLink` (active state via
  `useLocation()`, not a hand-rolled `isActive` className), `ScrollArea`, `Kbd`,
  `Divider`, `Group`/`Stack`/`Text`/`UnstyledButton` (`App.css`'s `.settings-option*`,
  `.sync-*`, `.tier-board-*`, and every `.sidebar-*` rule except the structural
  `.sidebar`/`.sidebar-scrim` positioning removed as each emptied out), and the
  duel view to Mantine `Container`/`Group`/`Stack`/`Progress`/`Card`/`Card.Section`/
  `Badge`/`Text`/`Title` (only card-hover-lift and absolute-overlay positioning for
  the tier badge/preview button stayed as CSS - Mantine has no prop for either).
  The tier board, tier page, rail, home, sidebar, playlist page and duel are all Mantine now (only hover states / keyframes stay as CSS).
  Still hand-rolled CSS in `App.css`: `PlayerDock`'s expanded/mini/floating layouts
  (plus its queue-column grid) and the duel card hover. Convert opportunistically whenever one of those is
  next touched, rather than in one big-bang rewrite - and when a hand-rolled class's
  last usage is removed, delete its now-dead CSS rule in the same pass (don't leave
  it orphaned "just in case").

## Housekeeping

- **Prefer popular, well-tested libraries over hand-written code - the user's standing
  preference.** If a mainstream library (high download count, actively maintained)
  solves the problem, use it rather than writing and debugging it ourselves: installing
  one is preferred over hand-rolling. Examples already in the codebase: `colord` for
  color math (not hex arithmetic), Mantine's
  `Radio.Card`/`ColorSwatch`/`Notifications`/`Spotlight`/`useElementSize`/`useHotkeys`
  instead of custom pickers, toasts, palettes or listeners, Mantine's
  `variantColorResolver`/`cssVariablesResolver` for theming. Only popular libraries -
  no obscure or unmaintained packages. Extensible, quick-to-write code built on those
  beats clever custom code.
- **Library-first, every time, no exceptions.** Before writing a single line of
  hand-rolled CSS or plain-DOM/manual state code, check whether an already-installed
  library does the job: Mantine's own component props (`style`/`styles`, `gap`, `radius`,
  `fit`, etc.) for anything visual, `ThemeIcon`/`Badge`/`Image`/`Kbd` etc. instead of a
  raw styled `<div>`/`<img>`, Redux Toolkit/TanStack Query patterns already established in
  `store/`/`api/` instead of ad hoc `useState`/`fetch`. Only fall back to a plain CSS rule
  in `App.css` when the library genuinely has no prop/component for it (a CSS Grid/flex
  layout shape, a `:hover` pseudo-class, an `@media` breakpoint) - and say so in a comment
  when you do, so it's clear it wasn't just the lazy default. The user has said this
  multiple times; reaching for `className`+`App.css` first, or "as well as" a library
  prop instead of "instead of" it, is the specific mistake to stop making.
- **The repo is public open source** at
  `https://github.com/DeM-Conve/project__tierlist.fm` (the user's explicit
  call: "use proper git strategy from now on for oss repo"). The product is
  **Tierlist.fm** everywhere - `project__yt` was a temporary name and is gone
  from the code (only the local folder is still called that); the Compose
  project is pinned to `name: tierlistfm` (containers `tierlistfm-*`, volume
  `tierlistfm_pgdata`). Never commit secrets - `.env` is gitignored, only
  `.env.example` (placeholders) is tracked.
- **Git strategy: trunk-based, every change through a PR** (see
  `CONTRIBUTING.md`). `main` is the only long-lived branch and the GitHub
  default (`dev` was retired 2026-09-24). For every piece of work: branch off
  `main` as `feat/*`, `fix/*`, `docs/*`, `chore/*` or `refactor/*`, commit
  there (Conventional Commits), push, open a PR into `main` with `gh pr
  create` (the template in `.github/` fills the body), then **merge it
  locally, never with GitHub's merge button**: squash the branch to one
  commit (`git reset --soft main && git commit`, message = the PR title, a
  Conventional Commit), `git push --force-with-lease` the branch, then
  fast-forward `main` to it (`git switch main && git merge --ff-only <branch>
  && git push`) - GitHub sees the PR's head land on `main` and marks it
  merged. Then `git push origin --delete <branch>` and delete it locally.
  Why: the merge button authors the commit with the GitHub *profile* name
  (the user's real name) and "GitHub" as committer; the user wants only
  `DeM-Conve` in history (a squash-merge leaked it once and history had to
  be rewritten on 2026-09-24).
  Don't commit straight to `main`. The GitHub
  repo auto-deletes merged branches, and a ruleset ("Protect main") blocks
  force-pushes and deleting `main`. Releases are
  annotated `vX.Y.Z` tags on `main` + `gh release create --generate-notes`
  (SemVer; not tagged yet - ask before cutting the first). Delete local
  topic branches once merged. `gh` lives at `~/.local/bin/gh` (not on the
  default PATH).
- **Nothing personal in the public repo** (the user's explicit call). No real
  name, work email/employer, home-directory paths or personal playlists in
  code, docs, screenshots, commit messages or authorship - only the
  `DeM-Conve` identity and its noreply email. The Java package is
  `fm.tierlist` (renamed through all history on 2026-09-24).
  Machine-local config (`.cursor/`, `.claude/`, `.impeccable/`, `.vscode/`)
  is gitignored - never commit it. Before pushing, scan the diff for these.
- **License: Business Source License 1.1** (`LICENSE`). Licensor DeM-Conve,
  work "Tierlist.fm", Additional Use Grant = free self-hosting for personal,
  non-commercial use (no hosted/managed/paid service, no selling), Change
  Date 2033-01-01, Change License MIT. BSL caps it at 4 years per released
  version, so each version really turns MIT 4 years after release. Don't
  touch the license terms without the user asking; third-party deps are
  MIT/Apache, so adding one with a copyleft or non-commercial license needs
  a check first.
- **`README.md` is the product pitch** (hero screenshot, why, features,
  how it works, self-host steps) for people landing on the public repo.
  Screenshots live in `docs/screenshots/` (`landing.png` is the signed-out
  page, capturable headless: `google-chrome --headless=new --window-size=1600,1000
  --virtual-time-budget=6000 --screenshot=... http://localhost/`); signed-in
  screens need the user's own login, so ask them for those. Keep README's
  feature list in step with `docs/features.md` when a headline feature lands.
- Commit incrementally as you go (the user asked for this explicitly, more than once).
- **Never add a `Co-Authored-By: Claude` (or any Claude/Anthropic attribution) line to
  commit messages or PR descriptions.** The user had these stripped from all existing
  history with `git filter-repo` and does not want Claude credited as an author
  anywhere in this repo's git history, going forward.
- After changing code, redeploy with `scripts/deploy.sh` (or `scripts/deploy.sh
  frontend`) before saying a fix is live - it runs every test first and refuses to
  deploy on a failure, then verifies the served bundle hash is the one just built
  (this repo has a history of "fixes" that were actually just a stale cached
  bundle).
