# Features

## Auth & data access
- Google login via Spring Security OAuth2 (session-based, no separate token storage).
- Signed-out landing page (`LoginView`): hero + "Continue with Google", feature summary, and an illustrative tier-board/duel mock (desktop only).
- Scopes: `openid`, `profile`, `https://www.googleapis.com/auth/youtube.force-ssl` (read + write access to playlists).
- `/api/auth/status` reports login state without forcing an OAuth redirect on an unauthenticated request.

## Playlist naming template (Settings -> Playlist naming)
- Modelled on Immich's storage template + migration job. One template (default `[{bracket}] {category} {tier}`; tokens `{bracket}` optional, `{category}`, `{tier}` required) defines which playlists are tier playlists **and** how they're named.
- **Privacy filter:** only playlists whose title matches the template appear anywhere in the app (Home, sidebar counts, command palette, playlist pages - a hidden playlist's URL redirects home). Home shows "N playlists hidden - not named by your template" (count only, no titles).
- Editor: presets, click-to-insert tokens, validation (required tokens, no duplicates, unknown tokens), a live example and a full "current name -> new name" preview table of every tier playlist, estimated YouTube API quota (~51 units per rename, 10,000/day).
- Safety checks block a run if two playlists would get the same name, or if a new name wouldn't read back as the same board/tier; warns when dropping `{bracket}` loses tags.
- **Rename job** ("Save & rename N on YouTube", with a confirm): renames in batches of 10 with a progress bar and per-playlist errors. Only titles change - the backend re-sends each playlist's existing description/language. While any rename is unfinished, both old and new names are recognised (nothing disappears); a banner offers Retry or "Stop recognising old names".
- "Save without renaming" switches the template only (with a warning about playlists that will stop matching).
- New tier playlists are named by the template: Home -> **New tier list** (category, bracket, which tiers, Private/Unlisted/Public) and a board's **Add missing tiers**; both preview the exact names and refuse names the template wouldn't recognise.

## Home & playlists
- `/` is **Home**: every board drawn as a mini tier list (tier chip + that tier playlist's cover + a bar sized by its video count), with Open / Quick sort / Duel on each card; a "Now playing" card (with a link back to rate it on its board) while the player is active; then every tier playlist as a card (tier badge + board name). Playlists not following the naming template are never listed.
- Home's filter box and the sidebar filter share the same query.
- (Replaced) the old "redirect to the first board on first login" - Home now leads with your boards, which is what that redirect existed for.
- Open a playlist to see its videos as a numbered list (thumbnail, title, channel, opens on YouTube); a tier playlist shows its tier and an "Open the <board> tier list" button.

## Sidebar
- Brand, "Jump to… ⌘K" (command palette), Home, and every board with its video total and a mini tier-mix bar (from playlist item counts - no per-board fetch). Filter box, empty-state hint explaining the playlist naming convention.
- Footer: Settings, Keyboard shortcuts (`?`), Log out. On narrow screens the sidebar is a drawer opened from a burger button.

## Tier boards (the tier list)
- Playlists named `[G]/[GA]/[OG] <Category> T1/T2/T3/TE/TZ` are auto-grouped into a per-category tier board.
- **Whole board on one screen**: one compact row per tier; each row shows as many square album-art tiles as fit on one line and folds the rest into a **"+N show all"** tile - so a tier of hundreds never pushes the rest of the board off screen.
- Each row's colored label shows the tier, its count (or `matches/total` while searching), **Play from this tier** and **Shuffle this tier**; clicking the label, the "+N" tile, or the row's `›` opens that tier's full list.
- Header: board name, "N videos · M tiers", a labelled **tier-mix bar** (segment per tier, hover for count, click to open that tier), and actions: Find (`/`), Share, Rank ▾ (Quick sort / Duel), Play (from the top tier) and Shuffle (whole board).
- Tiles: click plays, drag moves, hover/focus reveals a play affordance and a `⋯` menu (**Move to** any tier, **Top / Bottom of** this tier, **Open on YouTube**). Full title on hover tooltip.
- The playing video is marked (accent ring + animated equalizer) - only on the board it was opened from.
- Loading rows show Mantine `Skeleton`s; empty rows show a drop target.
- While the playlists list itself is still loading (right after login / a refresh), the sidebar and the board show skeleton placeholders instead of "0 tier lists" / "0 videos · 0 tiers".
- Vim-style `/` search (also the Find button): `/` opens a find box at the top of the screen (the `/` is part of the box's text - deleting it cancels), each row filters to its matches (and wraps to show all of them), `Enter`/`n` next match, `Shift+Enter`/`N` previous, `Enter` on a single match plays it, `Esc` closes. The active match is scrolled into view and highlighted.

## Tier Rail
- A permanent strip of the board's tiers down the right edge of the tier list and tier pages (desktop), with live counts. One click does the most useful thing available: **move the selected rows there** (when rows are selected) → otherwise **re-rate the playing song** into that tier (when it's from this board; the playing song's art sits on its current tier, with `⇧1-5` hints) → otherwise **open that tier**. The header says which mode it's in ("Move N to" / "Rate" / "Tiers").
- Every rail tier is a drop target: drag any tile or row onto it to move it there.

## Tier page (full list for big tiers)
- `/tier/<board>/t/<tier>`: a big tier header (Play / Shuffle / Quick sort this tier), tabs for every tier with counts (tabs are drop targets too), and the whole tier as a dense numbered list (rank, cover, title, channel).
- Every row has **one-click tier chips** (current tier filled) and a `⋯` menu (Top / Bottom / Open on YouTube). Click a row to play it.
- **Multi-select**: checkboxes, Shift-click for a range, header checkbox for all shown, `Ctrl+A` for all shown, `Esc` to clear. A floating bulk bar moves the selection to any tier or to the top of this one; the Tier Rail does the same.
- Filter box (`/` focuses it, `Esc` clears) filters by title or channel; drag rows to reorder (drop position maps back to the real position even while filtered).

## Instant feedback & undo
- Every tier edit - drag, menu, chip, bulk move, rail, player rating, quick sort, duel result - shows a toast (""Song" → T1", "Moved 5 videos → T2") with **Undo**, and `Ctrl/Cmd+Z` undoes the last edit anywhere (up to 50 steps; a bulk move or a whole duel result is one step). Undo history resets when the board is reloaded or discarded.

## Drag-and-drop tier editing
- Drag a video from one tier row to another, reorder within a row, drop onto the "+N" tile (appends), onto the Tier Rail, onto a tier tab, or reorder within a tier page's list. Rows tint in their tier color while hovered.
- Drop position is cursor-aware (shown by an accent insertion bar).
- Changes are staged locally first; nothing touches real YouTube data until you sync.

## Sync to YouTube
- A floating **staged-changes bar** (bottom-center, above the mini player) appears on every page of a board (tier list, tier page, quick sort) whenever there are staged changes: "N changes staged · review" / "Discard" / "Push to YouTube ⇧P". Compact on phones. After a push it briefly reports "Synced to YouTube" / "Some changes failed" / "Sync failed".
- Clicking "N changes staged" opens a popup (Mantine `Modal`) itemizing every staged change (video, from tier → to tier, or a duplicate removal - see below).
- "Push to YouTube" calls the backend, which inserts each video into its new playlist before removing it from the old one (so a failed delete never loses a video). Partial failures are reported per item.
- "Discard" reverts the board back to what's actually on YouTube.
- `Shift+P` pushes pending changes (only when there are any) from any board page, same as the button / palette action.

## Duplicate cleanup
- If the same video genuinely exists in two of a board's real tier playlists at once, the lower-tier copy is automatically staged as a pending removal (kept: the highest tier it's in; removed: every other copy) - no manual action needed to flag it.
- It shows up in the pending popup as `tier → removed (duplicate)`, and the tile is greyed out and tagged "Duplicate" (tooltip: removed on sync) until you sync.
- "Push to YouTube" actually deletes the redundant playlist entry (no bogus re-insert into the same playlist).

## Video focus modal
- Click any thumbnail to open a modal with a real, playable embedded YouTube player (via the official IFrame Player API — not a raw iframe), so playback failures (embedding disabled) are detected and shown with a clear fallback + "Open on YouTube" link.
- Keyboard shortcuts: `Esc` close, `←`/`→` or `h`/`l` (vim-style) to move prev/next, `Shift+1`–`Shift+N` to re-rate the current video (in every player mode - expanded, mini bar or floating - while you're on its board).
- Expanded view: an **"Up next" queue** beside the video (click any entry to jump to it; shows position and a Shuffle badge), and a backdrop glow in the playing song's tier color.
- Mini bar: tier chips for the playing song (click to re-rate), next to the volume controls.
- Navigation walks the whole board in tier order — reaching the end of one tier's videos rolls straight into the next tier instead of stopping.
- The browsing order is frozen the moment the modal opens, so reassigning a video's tier mid-browse never disturbs where "next" takes you.
- When a video finishes playing, it automatically advances to the next one (same tier first, then the next tier).
- "Rate" tier chips under the expanded video show the current tier and re-rate with a click as well as a shortcut.

## Shuffle play
- The board's Shuffle button opens the player on a random video from the board and auto-advances through a shuffled order (a "Shuffle" badge marks the session). Each tier row / tier page also shuffles just that tier. "Play" / "Play from T2" plays in tier order instead.

## Command palette
- `Cmd/Ctrl+K` opens a fuzzy-searchable palette to jump straight to any tier board, tier, or playlist, or trigger contextual actions (quick sort, start a duel, sync/discard pending changes) without leaving the keyboard.

## Quick sort
- `/tier/<board>/sort` (Rank ▾ → Quick sort, a board card, or a tier page): pick the whole board or one tier, shuffled or top-to-bottom, and start (`Enter`).
- Each song plays in the normal player (minimized); big cover with a glow in its current tier's color, the title, its current tier, and one giant button per tier (`1`-`5`, current tier = "keep"). Rating files it and plays the next; `S` skips, `U` undoes. Progress ("12 of 40 sorted · 5 moved") and the next three songs are shown.
- Follows the player: its own next/prev and auto-advance keep the session in step; if the player is stopped there's a "Resume" button. The end screen lists every change, with Undo / Sort more / Back to tier list. Changes are staged like any other edit.

## Share as an image
- Board → Share: a tier-list poster (board title, one row per tier with covers, "+N" overflow, small credit) with 10/20/40/80 covers per tier; **Download PNG** or **Copy image** to the clipboard.

## Duels (pairwise ranking)
- Rank ▾ → Duel on a tier board (or a Home card) launches a side-by-side comparison flow: two videos at a time, pick the one that deserves the higher tier.
- Each duel card can toggle a live embedded player preview (only one plays at a time) so you can actually watch/listen before choosing, plus a tier badge showing the video's current tier.
- Keyboard: `←` left wins, `→` right wins, `space` skip (strategy-dependent), `u` undo.
- Progress bar + "X of Y duels · Z% settled" status.
- Finishing a duel run re-applies the resulting order back onto the board's existing tier sizes (each tier keeps its current video count, just refilled from the new ranking) - as one undoable step.

### Duel strategies (Strategy pattern)
Swappable at runtime via a dropdown on the duel screen (and persisted as a default via Settings):
- **Tier-aware merge (default)** — treats each existing tier as an already-sorted run and k-way merges them, exploiting current tier placement to ask far fewer questions than a full sort (~n·log₂(tiers) comparisons instead of n·log₂(n)).
- **Full re-sort** — a complete interactive merge sort that ignores current tier placement entirely.
- **Elo** — rates videos via random pairwise duels using an Elo rating system; supports skip.

## Settings
- **Appearance** tab (default): pick a **theme** (Tokyo Night, Dracula, Warm charcoal - dark; Paper, Sand, Solarized Light - light; picking one also applies its signature accent), an **accent** (Blue, Violet, Teal, Green, Pink, Red, Orange, Amber - works with any theme; Warm charcoal + Amber is the original look) and a **tier palette** (Vivid, TierMaker classic, Heat). Each option shows a live mini preview, changes apply instantly across the whole app (including the share image) and are remembered in this browser. All colors come from one file, `frontend/src/themes.js`.
- Dedicated, persistent Settings page (GitHub-style layout: side nav + content), reachable via a gear icon in the sidebar or the `/settings` route.
- Choose the default duel strategy from here; the choice is shared with the in-duel dropdown and persisted in `localStorage`.
- "Keyboard shortcuts" tab: the full shortcut list (same source as the `?` modal).

## Routing
- Real, refreshable URLs (React Router): `/`, `/playlist/<id>`, `/tier/<category>`, `/tier/<category>/t/<tier>`, `/tier/<category>/sort`, `/tier/<category>/duel`, `/settings`. Refreshing directly on any board URL loads it correctly (previously a refresh could leave a board blank until you navigated away and back).
- Refreshing or using browser back/forward lands back on the exact board, playlist, or duel you were on.

## Keyboard shortcuts (full list)
Source of truth is `frontend/src/shortcuts.js` (rendered by the `?` modal and Settings → Keyboard shortcuts) - keep this list in sync with it.
- Global: `Ctrl/Cmd+K` command palette, `?` shortcut help, `Ctrl/Cmd+Z` undo last tier edit.
- Tier board: `/` search, `n` / `N` next/previous match, `Enter` play match (or step), `Esc` close search, `Shift+P` push to YouTube (any board page).
- Tier page: `/` filter, `Ctrl/Cmd+A` select all shown, `Shift+Click` range select, `Esc` clear selection/filter.
- Quick sort: `1`-`9` file into that tier, `S` skip, `U` undo, `Enter` start.
- Player: `h` / `l` prev/next track, `←`/`→` seek 10s (expanded), `Space` play/pause, `m` mute, `0`-`9` jump to that 10% (anywhere except Quick sort), `j` minimize (expanded → mini → floating), `k` expand, `Esc` minimize from expanded, `Shift+1`-`9` rate the playing video (any mode, on its board).
- Duel: `←` / `→` pick left/right, `Space` skip, `u` undo.

## Architecture
- React (Vite) frontend + Spring Boot (Java 21, Maven) backend, fully separated.
- Dockerized: `docker-compose.yml` (prod-style multi-stage builds) and `docker-compose.local.yml` (dev, volume-mounted for live editing).
