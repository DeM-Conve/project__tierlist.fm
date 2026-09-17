# project__yt

A personal tool to log into your own YouTube account, browse playlists, and manage a
custom tier-list system. Playlists named `[G]/[GA]/[OG] <Category> T1/T2/T3/TE/TZ` are
auto-grouped into a tier board per category.

## Stack

- **Frontend**: React 19 + Vite, in `frontend/`.
  - **Mantine** (`@mantine/core`, `@mantine/hooks`, `@mantine/spotlight`) is the UI
    component library - this is the final choice after trying MUI (rejected up front,
    too Material-flavored), then Tailwind+shadcn/ui (rejected, shadcn is copied-in
    scaffold code not a real dependency), then Tailwind+Radix UI (rejected in favor of a
    single full component library rather than utility CSS + headless primitives). Use
    Mantine's own components (`Tabs`, `Modal`, `Select`, etc.) for anything new/touched
    instead of hand-rolling equivalents.
  - The app's palette is themed into Mantine via `src/mantineTheme.js` (`createTheme`,
    `colors.dark` / `colors.accent` as 10-shade scales, `primaryColor: 'accent'`) so
    every Mantine component inherits the warm-charcoal look instead of Mantine's
    defaults. `MantineProvider` is mounted once in `main.jsx` with
    `forceColorScheme="dark"` (this app has no light mode).
  - `src/index.css` still holds the same palette as plain CSS variables (`--bg`,
    `--surface`, `--accent`, etc.) for the pre-Mantine hand-written `App.css`, which
    most existing components still use directly. Don't add new hand-written CSS classes
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
    (`usePlaylistsQuery`, `usePlaylistItemsQuery`, `useTierBoardQueries`,
    `useTierSyncMutation`, ...), never a raw `fetch`/`axios` call inline in a component.
    **axios** (`frontend/src/api/client.js`'s `api` instance) is the HTTP transport
    underneath it, not a separate calling convention - nothing outside `src/api/` should
    import axios directly. Playlists/login state is mirrored from its query result into
    `authSlice` via a `useEffect` (selectors elsewhere in the app read Redux, not the
    query cache, to avoid rewriting them) - see `App.jsx`'s top-level `App()` component
    and the `useLoadTierBoard` hook for the pattern.
  - **React Hook Form** (`react-hook-form`, installed) - there is currently no real form
    in this app for it to manage (login is a plain OAuth redirect; filter/search/settings
    inputs are simple controlled inputs with no validation need). Don't force it in
    somewhere it doesn't fit; use it if/when a real form with validation appears.
  - `lucide-react` is available for icons - prefer it over new unicode/emoji glyphs
    where a component is otherwise being touched.
- **Backend**: Spring Boot 3 (Java 21, Maven), in `backend/`. Session-based Google OAuth2
  login; talks to the YouTube Data API v3 directly (no separate token DB).
- **Deploy**: Docker Compose. `docker-compose.yml` (prod-style multi-stage builds) and
  `docker-compose.local.yml` (dev, volume-mounted). Rebuilding either container clears
  the backend's in-memory session, so you'll need to log in again after a redeploy.

## Conventions / decisions worth knowing

- **No MUI, no Tailwind, no shadcn/ui, no bare Radix.** All considered and explicitly
  rejected in favor of Mantine as a single, final UI library choice - see git history
  around the frontend stack migration for the reasoning behind each.
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
  point of a background-playback mini bar.
- **Routing is React Router** (`react-router-dom`), not hand-rolled History API calls -
  see `App.jsx`. `tiersSlice.loadedCategory` guards `TierBoardPage`/`DuelPage` against
  re-fetching a board that's already loaded when the router remounts the page (e.g.
  returning from a duel) - removing that guard would silently discard an unsynced duel
  result or drag on every board/duel round-trip. Don't refetch tier-board data on mount
  without checking `loadedCategory` first.
- **Duel ranking uses the Strategy pattern** (`frontend/src/duel/`): multiple
  interchangeable ranking algorithms (`tierAwareMerge` default, `mergeSort`, `elo`)
  behind a common interface, swappable at runtime from the duel screen or persisted as a
  default from Settings.
- Full feature list: `docs/features.md`. Keep it updated when you add a user-facing
  feature.

## Pending work (frontend stack migration, in progress)

The user asked for these on top of the Mantine/Redux migration above. Tracked here
(no task-tracking tool is available in this environment) - update as items land:

- [x] **React Router** - done. Real `Routes`/`Route`s (`/`, `/playlist/:id`,
  `/tier/:category`, `/tier/:category/duel`, `/settings`) replace the hand-rolled
  History-API routing. Also fixed a latent bug found while doing this: navigation
  used to unconditionally close the player dock, defeating the "plays in the
  background" point of the mini bar - navigation no longer touches it at all.
- [x] **TanStack Query + axios** - done. `frontend/src/api/` (`client.js`'s axios
  instance, `queries.js`'s hooks) is now the only place API calls happen; no
  component does a raw `fetch`. `itemsSlice` was removed entirely (ItemsPage reads
  straight from `usePlaylistItemsQuery`); `tiersSlice.loadedCategory` mediates
  between TanStack Query's cache (pristine server data) and the local editable draft
  (drags, duel results) - see `useLoadTierBoard` in `App.jsx`. Don't refetch
  tier-board data on mount without checking `loadedCategory` first, and don't
  reintroduce a raw `fetch`/inline `axios` call in a component - add a hook in
  `api/queries.js` instead.
- [ ] **React Hook Form** - installed, still nothing to use it on (see Stack section
  above). Not a gap to close proactively.
- [~] **Stop hand-writing CSS, use Mantine components instead** - in progress, real
  ground covered but not finished. Done so far: every plain `<button className="btn
  ...">` across the app converted to Mantine `Button`/`ActionIcon`
  (`App.css`'s now-dead `.btn`/`.btn-primary`/`.btn-ghost`/`.sidebar-search`/
  `.duel-strategy-select` rules removed as each one emptied out), the sidebar filter
  input converted to Mantine `TextInput`, and the duel-strategy dropdown to Mantine
  `Select`. Still hand-rolled CSS in `App.css`: the tier board grid/rows, drag-and-
  drop thumbnails, `PlayerDock`'s expanded/mini layouts, the duel cards, and most of
  `Sidebar`'s/`SettingsView`'s structural layout. Convert opportunistically whenever
  one of those is next touched, rather than in one big-bang rewrite - and when a
  `.btn`-style class's last usage is removed, delete its now-dead CSS rule in the
  same pass (don't leave it orphaned "just in case").

## Housekeeping

- Commit incrementally as you go (the user asked for this explicitly, more than once).
- After changing frontend code, rebuild and redeploy before saying a fix is live:
  `npx vite build` in `frontend/`, then `docker compose -f docker-compose.yml up -d
  --build` (frontend, or both if backend also changed) from the project root. Verify the
  served bundle hash actually changed via `curl -s http://localhost:5183 | grep -o
  'index-[^"]*\.\(js\|css\)'` before reporting something as fixed - this repo has a
  history of "fixes" that were actually just a stale cached bundle.
