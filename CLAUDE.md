# project__yt

A personal tool to log into your own YouTube account, browse playlists, and manage a
custom tier-list system. Playlists named `[G]/[GA]/[OG] <Category> T1/T2/T3/TE/TZ` are
auto-grouped into a tier board per category.

## Stack

- **Frontend**: React 19 + Vite, in `frontend/`.
  - **Tailwind CSS v4** (via `@tailwindcss/vite`) for styling. `src/index.css` defines the
    app's palette as CSS variables mapped onto Tailwind's own semantic tokens
    (`--background`, `--primary`, etc.) via `@theme inline` - use Tailwind utility classes
    (`bg-primary`, `text-muted-foreground`, ...) for anything new.
  - `App.css` is the pre-Tailwind hand-written stylesheet (still large, still loaded) -
    most existing components' classes live there. Don't add new hand-written CSS rules
    there; use Tailwind utilities in the component's JSX instead. Convert an existing
    class to Tailwind opportunistically when you're already touching that component, but
    there's no standing task to rewrite all of it at once.
  - **Radix UI** (the `radix-ui` package, e.g. `import { Dialog, Tabs } from 'radix-ui'`)
    for interactive primitives (dialogs, tabs, dropdowns, etc.) instead of hand-rolling
    focus-trapping/keyboard nav/portals. Explicitly **not** shadcn/ui - the user wants
    Radix installed as a normal dependency and styled directly, not a CLI-copied
    component scaffold.
  - **Redux Toolkit** (`@reduxjs/toolkit` + `react-redux`) for all app-level state, in
    `frontend/src/store/`. One slice per concern (`authSlice`, `viewSlice`, `itemsSlice`,
    `tiersSlice`, `focusSlice`); cross-slice derived values (pending moves, duel pools,
    focus navigation sequence, etc.) are memoized selectors in `store/selectors.js`, not
    component-level `useMemo`. `App.jsx` should stay a thin container that dispatches
    actions and reads selectors - it shouldn't hold its own `useState` for app data.
  - `lucide-react` is available for icons (installed alongside Radix) - prefer it over
    new unicode/emoji glyphs where a component is otherwise being touched.
- **Backend**: Spring Boot 3 (Java 21, Maven), in `backend/`. Session-based Google OAuth2
  login; talks to the YouTube Data API v3 directly (no separate token DB).
- **Deploy**: Docker Compose. `docker-compose.yml` (prod-style multi-stage builds) and
  `docker-compose.local.yml` (dev, volume-mounted). Rebuilding either container clears
  the backend's in-memory session, so you'll need to log in again after a redeploy.

## Conventions / decisions worth knowing

- **No shadcn/ui.** Considered and explicitly rejected in favor of Radix UI directly -
  see git history around the Tailwind/Redux migration for the reasoning.
- **Duplicate videos are auto-resolved, not flagged for the user to decide.** If the same
  video exists in two of a board's real tier playlists, the highest-tier copy is kept and
  every other copy is automatically staged as a pending removal (shows in the "N pending"
  popup as `tier → removed (duplicate)`). No manual dedupe UI.
- **The embedded video player must never be unmounted/remounted just to change its
  layout.** `PlayerDock` renders in `expanded` (full-screen) or `mini` (bottom bar,
  YouTube-Music-style) mode via CSS class changes on the same DOM shape - never via
  conditionally mounting/unmounting the player subtree - so minimizing never
  interrupts playback.
- **Duel ranking uses the Strategy pattern** (`frontend/src/duel/`): multiple
  interchangeable ranking algorithms (`tierAwareMerge` default, `mergeSort`, `elo`)
  behind a common interface, swappable at runtime from the duel screen or persisted as a
  default from Settings.
- Full feature list: `docs/features.md`. Keep it updated when you add a user-facing
  feature.

## Housekeeping

- Commit incrementally as you go (the user asked for this explicitly, more than once).
- After changing frontend code, rebuild and redeploy before saying a fix is live:
  `npx vite build` in `frontend/`, then `docker compose -f docker-compose.yml up -d
  --build` (frontend, or both if backend also changed) from the project root. Verify the
  served bundle hash actually changed via `curl -s http://localhost:5183 | grep -o
  'index-[^"]*\.\(js\|css\)'` before reporting something as fixed - this repo has a
  history of "fixes" that were actually just a stale cached bundle.
