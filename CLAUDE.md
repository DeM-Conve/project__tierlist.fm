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
  - **Redux Toolkit** (`@reduxjs/toolkit` + `react-redux`) for all app-level state, in
    `frontend/src/store/`. One slice per concern (`authSlice`, `viewSlice`, `itemsSlice`,
    `tiersSlice`, `focusSlice`); cross-slice derived values (pending moves, duel pools,
    focus navigation sequence, etc.) are memoized selectors in `store/selectors.js`, not
    component-level `useMemo`. `App.jsx` should stay a thin container that dispatches
    actions and reads selectors - it shouldn't hold its own `useState` for app data.
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

- [x] **React Router** - done. Replaced the hand-rolled History-API routing in
  `App.jsx` with real `Routes`/`Route`s (`/`, `/playlist/:id`, `/tier/:category`,
  `/tier/:category/duel`, `/settings`), a `Layout` route (Sidebar + player dock +
  command palette, mounted once) wrapping page components that read `useParams`.
  Also fixed a latent bug while doing this: navigating to a different page used to
  unconditionally close the player dock, defeating the "plays in the background"
  point of the mini bar - navigation no longer touches it at all.
- [ ] **TanStack Query** (`@tanstack/react-query`, installed) as the primary data-fetching
  layer, with **axios** (installed) as the HTTP client, replacing the manual
  `fetch`/`dispatch(setX(...))` boilerplate in `loadPlaylists`/`openItems`/
  `loadTierBoardData`/`syncChanges`. Plan: TanStack Query owns the *pristine* server
  snapshot (playlists, playlist items, tier-board items); Redux's `tiersSlice` keeps
  owning the *local editable draft* (`tierItems`, drag state) seeded from query
  results, since drag-and-drop staging before sync doesn't fit a pure server-cache
  model. `syncChanges` becomes a `useMutation` that invalidates the relevant queries.
- [ ] **React Hook Form** (`react-hook-form`, installed) - flagged, but there is
  currently no real form in this app to use it on (login is a plain OAuth redirect;
  filter/search/settings inputs are simple controlled inputs with no validation
  need). Don't force it in somewhere it doesn't fit; use it if/when a real form
  appears (e.g. a settings field with validation).
- [ ] **Stop hand-writing CSS, use Mantine components instead.** The user wants
  `App.css` phased out in favor of Mantine's own components (`Group`, `Stack`,
  `AppShell`, `Card`, `TextInput`, `ActionIcon`, `Badge`, etc.) rather than custom
  divs + classNames. This is a large, incremental effort across every existing
  component (Sidebar, TierBoardView, DuelView, PlaylistsView, ItemsView, PlayerDock,
  CommandPalette, SettingsView) - convert opportunistically whenever a component is
  already being touched, rather than as one risky big-bang rewrite.



- Commit incrementally as you go (the user asked for this explicitly, more than once).
- After changing frontend code, rebuild and redeploy before saying a fix is live:
  `npx vite build` in `frontend/`, then `docker compose -f docker-compose.yml up -d
  --build` (frontend, or both if backend also changed) from the project root. Verify the
  served bundle hash actually changed via `curl -s http://localhost:5183 | grep -o
  'index-[^"]*\.\(js\|css\)'` before reporting something as fixed - this repo has a
  history of "fixes" that were actually just a stale cached bundle.
