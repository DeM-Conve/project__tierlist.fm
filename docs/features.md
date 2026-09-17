# Features

## Auth & data access
- Google login via Spring Security OAuth2 (session-based, no separate token storage).
- Scopes: `openid`, `profile`, `https://www.googleapis.com/auth/youtube.force-ssl` (read + write access to playlists).
- `/api/auth/status` reports login state without forcing an OAuth redirect on an unauthenticated request.

## Playlists
- Browse all of the logged-in account's YouTube playlists.
- Open a playlist to see its videos (thumbnail, title, channel).

## Tier boards
- Playlists named `[G]/[GA]/[OG] <Category> T1/T2/T3/TE/TZ` are auto-grouped into a per-category tier board.
- Sidebar lists every detected category as a "tier board," alongside a plain "Playlists" view and a filter box.
- Each board renders as colored tier rows (T1 → TZ) filled with the real videos from each underlying playlist.

## Drag-and-drop tier editing
- Drag a video from one tier row to another, or reorder it within the same row.
- Drop position is cursor-aware (drops land where you release, not just appended to the end).
- Changes are staged locally first; nothing touches real YouTube data until you sync.

## Sync to YouTube
- "N pending" / "Discard" / "Push to YouTube" controls appear only when there are real staged changes, grouped in their own pill in the board header, separate from general board utilities (Shuffle play, Start duel).
- Clicking "N pending" opens a popup itemizing every staged change (video, from tier → to tier, or a duplicate removal - see below).
- "Push to YouTube" calls the backend, which inserts each video into its new playlist before removing it from the old one (so a failed delete never loses a video). Partial failures are reported per item.
- "Discard" reverts the board back to what's actually on YouTube.

## Duplicate cleanup
- If the same video genuinely exists in two of a board's real tier playlists at once, the lower-tier copy is automatically staged as a pending removal (kept: the highest tier it's in; removed: every other copy) - no manual action needed to flag it.
- It shows up in the pending popup as `tier → removed (duplicate)`, and the thumbnail is tagged "Removing (duplicate)" until you sync.
- "Push to YouTube" actually deletes the redundant playlist entry (no bogus re-insert into the same playlist).

## Video focus modal
- Click any thumbnail to open a modal with a real, playable embedded YouTube player (via the official IFrame Player API — not a raw iframe), so playback failures (embedding disabled) are detected and shown with a clear fallback + "Open on YouTube" link.
- Keyboard shortcuts: `Esc` close, `←`/`→` or `h`/`l` (vim-style) to move prev/next, `Shift+1`–`Shift+N` to reassign the current video's tier.
- Navigation walks the whole board in tier order — reaching the end of one tier's videos rolls straight into the next tier instead of stopping.
- The browsing order is frozen the moment the modal opens, so reassigning a video's tier mid-browse never disturbs where "next" takes you.
- When a video finishes playing, it automatically advances to the next one (same tier first, then the next tier).
- Tier pills at the bottom show the current tier and let you reassign with a click as well as a shortcut.

## Shuffle play
- A "🔀 Shuffle play" button on each tier board opens the focus modal on a random video from that board and auto-advances through a shuffled order (a "🔀 Shuffle" badge marks the session as shuffled). Uses the same auto-advance-on-end and prev/next controls as normal browsing.

## Command palette
- `Cmd/Ctrl+K` opens a fuzzy-searchable palette to jump straight to any tier board or playlist, or trigger contextual actions (start a duel, sync/discard pending changes) without leaving the keyboard.

## Duels (pairwise ranking)
- "Start duel" on a tier board launches a side-by-side comparison flow: two videos at a time, pick the one that deserves the higher tier.
- Each duel card can toggle a live embedded player preview (only one plays at a time) so you can actually watch/listen before choosing, plus a tier badge showing the video's current tier.
- Keyboard: `←` left wins, `→` right wins, `space` skip (strategy-dependent), `u` undo.
- Progress bar + "X of Y duels · Z% settled" status.
- Finishing a duel run re-applies the resulting order back onto the board's existing tier sizes (each tier keeps its current video count, just refilled from the new ranking).

### Duel strategies (Strategy pattern)
Swappable at runtime via a dropdown on the duel screen (and persisted as a default via Settings):
- **Tier-aware merge (default)** — treats each existing tier as an already-sorted run and k-way merges them, exploiting current tier placement to ask far fewer questions than a full sort (~n·log₂(tiers) comparisons instead of n·log₂(n)).
- **Full re-sort** — a complete interactive merge sort that ignores current tier placement entirely.
- **Elo** — rates videos via random pairwise duels using an Elo rating system; supports skip.

## Settings
- Dedicated, persistent Settings page (GitHub-style layout: side nav + content), reachable via a gear icon in the sidebar or the `/settings` route.
- Choose the default duel strategy from here; the choice is shared with the in-duel dropdown and persisted in `localStorage`.

## Routing
- Real, refreshable URLs via the native History API: `/`, `/playlist/<id>`, `/tier/<category>`, `/tier/<category>/duel`, `/settings`.
- Refreshing or using browser back/forward lands back on the exact board, playlist, or duel you were on.

## Architecture
- React (Vite) frontend + Spring Boot (Java 21, Maven) backend, fully separated.
- Dockerized: `docker-compose.yml` (prod-style multi-stage builds) and `docker-compose.local.yml` (dev, volume-mounted for live editing).
