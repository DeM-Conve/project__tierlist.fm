# Features

## Auth & data access
- Google login via Spring Security OAuth2 (session-based, no separate token storage).
- Signed-out landing page (`LoginView`): hero + "Continue with Google", feature summary, and an illustrative tier-board/duel mock (desktop only).
- Scopes: `openid`, `profile`, `https://www.googleapis.com/auth/youtube.force-ssl` (read + write access to playlists).
- `/api/auth/status` reports login state without forcing an OAuth redirect on an unauthenticated request.

## Playlist naming template (Settings -> Playlist naming)
- Modelled on Immich's storage template + migration job. One template defines which playlists are tier playlists **and** how they're named. Tokens: `{category}`, `{tier}` (required), `{tag}` (optional prefix label, e.g. the G in "[G] Rap T1"; `{bracket}` still works as an alias).
- Generic default `{category} {tier}` ("Rap T1"). On first use in a browser the app **auto-detects** the preset that fits the user's existing playlist names (most matches, then most specific - so "[G] Rap T1"-style libraries get `[{tag}] {category} {tier}`); Settings also has **Detect from my playlists**. Presets are grouped "Simple" / "With a tag".
- **Privacy filter:** only playlists whose title matches the template appear anywhere in the app (Home, sidebar counts, command palette, playlist pages - a hidden playlist's URL redirects home). Home shows "N playlists hidden - not named by your template" (count only, no titles).
- Editor: presets, click-to-insert tokens, validation (required tokens, no duplicates, unknown tokens), a live example and a full "current name -> new name" preview table of every tier playlist, estimated YouTube API quota (~51 units per rename, 10,000/day).
- Safety checks block a run if two playlists would get the same name, or if a new name wouldn't read back as the same board/tier; warns when dropping `{tag}` loses tags.
- **Rename job** ("Save & rename N on YouTube", with a confirm): renames in batches of 10 with a progress bar and per-playlist errors. Only titles change - the backend re-sends each playlist's existing description/language. While any rename is unfinished, both old and new names are recognised (nothing disappears); a banner offers Retry or "Stop recognising old names".
- "Save without renaming" switches the template only (with a warning about playlists that will stop matching).
- New tier playlists are named by the template: Home -> **New tier list** (category, bracket, which tiers, Private/Unlisted/Public) and a board's **Add missing tiers**; both preview the exact names and refuse names the template wouldn't recognise.

## Home & playlists
- `/` is **Home**: every board drawn as a mini tier list (tier chip + that tier playlist's cover + a bar sized by its video count), with Open / Duel on each card; a "Now playing" card (with a link back to rate it on its board) while the player is active; then every tier playlist as a card (tier badge + board name). Playlists not following the naming template are never listed.
- Home's filter box and the sidebar filter share the same query.
- (Replaced) the old "redirect to the first board on first login" - Home now leads with your boards, which is what that redirect existed for.
- Open a playlist to see its videos as a numbered list (thumbnail, title, channel, opens on YouTube); a tier playlist shows its tier and an "Open the <board> tier list" button.

## Inbox (adding new songs)
- `/inbox`: songs you **liked on YouTube / YouTube Music** (the 300 most recent likes, keeping only videos YouTube files under Music - clips, shorts and talks stay out) that aren't on any board yet, one big card at a time - liking a song is the "add" step, filing it is one keypress. Sidebar "Inbox" link with a count badge, a card on Home, a command-palette entry.
- The board is **guessed from the artist** (the board with the most songs by them; else the board the last song went to), shown with the reason; `b` or the picker changes it.
- `1`-`5` (or click the big tier buttons) files the song straight into that tier on YouTube - no pending step, since it wasn't on a board. `t` saves it to the board's TODO list ("Later") when the board has one. `s` skips (to the back), `x` "Not a song" hides it for good (saved per account in Postgres), `u` / `Ctrl+Z` / the toast's Undo reverts the last one (deletes the added playlist item).
- `Enter` / clicking the cover plays it in the mini player; filing the playing song plays the next one, and when a song ends by itself the card follows.
- **Paste a YouTube link anywhere** (`Ctrl+V` outside a text box, or the paste box on the Inbox): watch / youtu.be / music / shorts links all work. A new song jumps to the front of the Inbox; one already on a board just says where it is.
- Up next strip below the card (click to jump). Loading shows progress while every tier playlist is checked; empty state is "Inbox zero".

## Sidebar
- Brand, "Jump to… ⌘K" (command palette), Home, Inbox (with a count of liked songs waiting), and every board with its video total (from playlist item counts - no per-board fetch). Filter box, empty-state hint explaining the playlist naming convention.
- Footer: Settings, Keyboard shortcuts (`?`), Log out. On narrow screens the sidebar is a drawer opened from a burger button.

## Tier boards (the tier list)
- Playlists named `[G]/[GA]/[OG] <Category> T1/T2/T3/TE/TZ` are auto-grouped into a per-category tier board (plus an optional `<Category> TODO` list - see below).
- **Whole board on one screen, filling it**: the board measures the height left under the header (above the mini player and footer) and turns it into lines of square album-art tiles. Every tier gets one line, and each spare line goes to the tier hiding the most songs, so big tiers show 2+ lines while small ones stay compact. Whatever still doesn't fit folds into a **"+N show all"** tile. It re-fits live on window resize and when the mini player opens or closes; it only scrolls when even one line per tier doesn't fit.
- Every tile prints its **song name** (and the artist, on desktop) over the bottom of the cover, so songs sharing one album cover are tellable apart without hovering. Names come from the video title with the "(Official Video)"/"[Lyrics]"/"| Album" noise stripped; "Artist - Song" titles are split into song + artist, otherwise the channel is the artist. Tiles stay square (88px desktop, 64px phone; one-line name on phones).
- Each row's colored label shows the tier, its count (or `matches/total` while searching), **Play from this tier** and **Shuffle this tier**; clicking the label, the "+N" tile, or the row's `›` opens that tier's full list.
- Header: board name, "N videos · M tiers", a labelled **tier-mix bar** (segment per tier, hover for count, click to open that tier), and actions: Find (`/`), Duel, Play (from the top tier) and Shuffle (whole board).
- Tiles: click plays, drag moves, hover/focus reveals a play affordance and a `⋯` menu (**Move to** any tier, **Top / Bottom of** this tier, **Open on YouTube**). Full title on hover tooltip.
- The playing video is marked (accent ring + animated equalizer) - only on the board it was opened from.
- Loading rows show Mantine `Skeleton`s; empty rows show a drop target.
- While the playlists list itself is still loading (right after login / a refresh), the sidebar and the board show skeleton placeholders instead of "0 tier lists" / "0 videos · 0 tiers".
- Vim-style `/` search (also the Find button): `/` opens a find box at the top of the screen (the `/` is part of the box's text - deleting it cancels), each row filters to its matches (and wraps to show all of them), `Enter`/`n` next match, `Shift+Enter`/`N` previous, `Enter` on a single match plays it, `Esc` closes. The active match is scrolled into view and highlighted. Matches song title, channel **and artist name**; every word must match, in any order, ignoring case and accents (`krsna makasam`, `beyonce`).

## TODO list (songs waiting for a tier)
- A board can have a **TODO playlist**: its inbox - save songs there on YouTube, then decide their tier here.
- **How a playlist becomes one** (Settings -> Playlist naming -> **To-do lists**): its name contains the **keyword** (default `TODO`, changeable - words of letters/digits, not a tier code) as a whole word, anywhere, any case. The rest of the name, once the keyword is taken out, must be a board's name - optionally with that board's tag; punctuation, brackets, `_` and case are ignored. So `[G] Rap TODO`, `TODO - Rap`, `rap todo`, `Todo: Rap`, `[G] Jazz Cozy todo` (board `Jazz_Cozy`) all work. Any other name (`My TODO stuff`) can be **assigned to a board by hand** in that table (or back to "Automatic"). A board uses one: a hand-assigned list beats a name match, then the first wins; the table shows every candidate's status (found / linked / not used - board already has one / no board / board doesn't exist). The keyword and the assignments are saved to your account. To-do lists are never renamed by the naming template's rename job.
- On the board it's its own row **above the tiers** (neutral grey, "N to do" in the header); it's excluded from the tier-mix bar, the "N videos" total and duels (it isn't ranked). Every move menu, row chip set, tier tab and the Tier Rail (a small TODO slot at the bottom) include it, so a song can be sent back to TODO too.
- **Triage** (header button, the TODO row's play button, the TODO page's button, or the palette's "Triage the <board> TODO list"): plays the TODO songs in order; giving the playing song a tier - player chips / `Shift+1-5`, the rail, a menu, a drag - moves it and starts the next to-do song (songs already rated some other way are skipped). The player shows a "Triage" badge.
- The TODO tier page (`/tier/<board>/t/TODO`) is the list view of the same thing: click a row's tier chip to rate it.
- If a song is both in TODO and a real tier, the rated copy wins and the TODO copy is staged as a duplicate removal.
- A board without one shows **Add a TODO list**: pick an existing playlist with the keyword that isn't in use (it gets assigned to this board), or create a new one (named by the template with the keyword in the tier's place, e.g. `[G] Rap TODO`); New tier list can create it too. The sidebar shows each board's to-do count as a small grey badge.

## Tier Rail
- A permanent strip of the board's tiers down the right edge of the tier list and tier pages (desktop), with live counts. **Global like the player:** while a song plays, the rail stays on Home, Settings and playlist pages too, showing the playing song's board so you can still rate it there (hidden only on the duel screen). One click does the most useful thing available: **re-rate the playing song** into that tier (when it's from this board; the playing song's art sits on its current tier, with `⇧1-5` hints) → otherwise **open that tier**. The header says which mode it's in ("Rate" / "Tiers").
- Every rail tier is a drop target: drag any tile or row onto it to move it there.

## Tier page (full list for big tiers)
- `/tier/<board>/t/<tier>`: a big tier header (Play / Shuffle this tier), tabs for every tier with counts (tabs are drop targets too), and the whole tier as a dense numbered list (rank, cover, title, channel).
- Every row has **one-click tier chips** (current tier filled) and a `⋯` menu (Top / Bottom / Open on YouTube). Click a row to play it.
- Each row shows the song name and artist (same cleaned-up names as the board tiles; full title on hover), its tier chips (click one to move it) and a `⋯` menu. No multi-select - moving is per song (chips, drag, the Tier Rail).
- Filter box (`/` focuses it, `Esc` clears) filters by title, channel or artist (same matching as the board's `/` search); drag rows to reorder (drop position maps back to the real position even while filtered).

## Instant feedback & undo
- Every tier edit - drag, menu, chip, bulk move, rail, player rating, duel result - shows a toast (""Song" → T1", "Moved 5 videos → T2") with **Undo**, and `Ctrl/Cmd+Z` undoes the last edit anywhere (up to 50 steps; a bulk move or a whole duel result is one step). Undo history resets when the board is reloaded or discarded.

## Drag-and-drop tier editing
- Drag a video from one tier row to another, reorder within a row, drop onto the "+N" tile (appends), onto the Tier Rail, onto a tier tab, or reorder within a tier page's list. Rows tint in their tier color while hovered.
- Drop position is cursor-aware (shown by an accent insertion bar).
- Changes are staged locally first; nothing touches real YouTube data until you sync.

## Sync to YouTube
- **Remove from a playlist**: every board has a **Remove** row at the bottom (trash icon), and the Tier Rail has a matching trash slot under the tiers. Drop a song on either, or pick **Remove from playlist** in a tile's/row's `⋯` menu, or click the rail's trash while a song plays, and it's staged for deletion. It's a pending change like any move: the toast says "will be removed on push", it's listed as `tier → Removed` in the review (with put-back), Undo/Ctrl+Z/Discard bring it back, and dragging it out of the Remove row (or its menu's "Move to") keeps it. Push deletes that playlist item on YouTube. Removing the top copy of a duplicated song keeps the next copy down (no extra auto-dedupe).
- A floating **staged-changes bar** (bottom-center, above the mini player) appears on every page of a board (tier list, tier page) whenever there are staged changes: "N changes staged · review" / "Discard" / "Push to YouTube ⇧P". Compact on phones. After a push it briefly reports "Synced to YouTube" / "Some changes failed" / "Sync failed".
- **Review changes** (click "N changes staged · review"): a simple list - cover, song and artist, `from → to` tier chips (or "Duplicate removed"), and a **Put back** button per move (undoable); Discard all / Push to YouTube (`Shift+P`) at the bottom. Closes itself once nothing is left.
- Clicking "N changes staged" opens a popup (Mantine `Modal`) itemizing every staged change (video, from tier → to tier, or a duplicate removal - see below).
- "Push to YouTube" calls the backend, which inserts each video into its new playlist before removing it from the old one (so a failed delete never loses a video). Partial failures are reported per item.
- "Discard" reverts the board back to what's actually on YouTube.
- `Shift+P` pushes pending changes (only when there are any) from any board page, same as the button / palette action.

## Duplicate cleanup
- If the same video genuinely exists in two of a board's real tier playlists at once, the lower-tier copy is automatically staged as a pending removal (kept: the highest tier it's in; removed: every other copy) - no manual action needed to flag it. The review spells it out per song: **🗑 Delete [TODO] · kept in [T2]** - the outlined chip is the copy being deleted, the solid chip is where the song stays (hover for a sentence). Manual removals read the same way (**🗑 Delete [T2]**).
- It shows up in the pending popup as `tier → removed (duplicate)`, and the tile is greyed out and tagged "Duplicate" (tooltip: removed on sync) until you sync.
- "Push to YouTube" actually deletes the redundant playlist entry (no bogus re-insert into the same playlist).

## Video focus modal
- Click any thumbnail to open a modal with a real, playable embedded YouTube player (via the official IFrame Player API — not a raw iframe), so playback failures (embedding disabled) are detected and shown with a clear fallback + "Open on YouTube" link.
- Keyboard shortcuts: `Esc` close, `←`/`→` or `h`/`l` (vim-style) to move prev/next, `Shift+1`–`Shift+N` to re-rate the current video (in every player mode - expanded, mini bar or floating - while you're on its board).
- Expanded view: a **queue panel** beside the video, as tall as the player - a pinned "Now playing" card, then the numbered "Up next" list (click any entry to jump to it, hover × to remove it from the queue; shows position and a Shuffle badge) - plus on-screen transport controls (prev, back 10s, play/pause, forward 10s, next, volume) and a backdrop glow in the playing song's tier color.
- **Play next / Add to queue** (YouTube-Music-style) in every song's "…" menu: puts the song right after the playing one, or at the end of the queue (a song already queued is moved, not duplicated). With nothing playing, it just starts playing in the mini bar.
- Mini bar: tier chips for the playing song (click to re-rate), next to the volume controls.
- Navigation walks the whole board in tier order — reaching the end of one tier's videos rolls straight into the next tier instead of stopping.
- The browsing order is frozen the moment the modal opens, so reassigning a video's tier mid-browse never disturbs where "next" takes you.
- When a video finishes playing, it automatically advances to the next one (same tier first, then the next tier).
- "Rate" tier chips under the expanded video show the current tier and re-rate with a click as well as a shortcut.

## Shuffle play
- The board's Shuffle button opens the player on a random video from the board and auto-advances through a shuffled order (a "Shuffle" badge marks the session). Each tier row / tier page also shuffles just that tier. "Play" / "Play from T2" plays in tier order instead.

## Command palette
- `Cmd/Ctrl+K` opens a fuzzy-searchable palette to jump straight to any tier board, tier, or playlist, or trigger contextual actions (start a duel, sync/discard pending changes) without leaving the keyboard.

## Duels (pairwise ranking)
- Duel on a tier board (or a Home card) launches a side-by-side comparison flow: two videos at a time, pick the one that deserves the higher tier.
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
- **Appearance** tab (default): pick a **theme** (Tokyo Night, Dracula, Warm charcoal - dark; Paper, Sand, Solarized Light - light; picking one also applies its signature accent), an **accent** (Blue, Violet, Teal, Green, Pink, Red, Orange, Amber - works with any theme; Warm charcoal + Amber is the original look) and a **tier palette** (Vivid, TierMaker classic, Heat). Each option shows a live mini preview, changes apply instantly across the whole app and are saved to your account. All colors come from one file, `frontend/src/themes.js`.
- Dedicated, persistent Settings page (GitHub-style layout: side nav + content), reachable via a gear icon in the sidebar or the `/settings` route.
- Choose the default duel strategy from here; the choice is shared with the in-duel dropdown and saved to your account.
- **Settings follow your Google account** (Postgres): theme, accent, tier palette, naming template (+ an unfinished migration), to-do list keyword + hand-assigned to-do lists, and duel strategy are saved per account and load on any browser you sign into. This browser keeps a cached copy so the right theme shows before the first paint; the account's copy wins once it loads. The first time an account signs in, the settings already on that browser are uploaded, so nothing is lost. A failed save shows a toast and retries on the next change. Two devices editing at once don't clobber each other: if another device saved first, this one fetches its version, keeps its own edits on top and saves again.
- "Keyboard shortcuts" tab: the full shortcut list (same source as the `?` modal).

## Routing
- Real, refreshable URLs (React Router): `/`, `/playlist/<id>`, `/tier/<category>`, `/tier/<category>/t/<tier>`, `/tier/<category>/duel`, `/settings`. Refreshing directly on any board URL loads it correctly (previously a refresh could leave a board blank until you navigated away and back).
- Refreshing or using browser back/forward lands back on the exact board, playlist, or duel you were on.

## Keyboard shortcuts (full list)
Source of truth is `frontend/src/shortcuts.js` (rendered by the `?` modal and Settings → Keyboard shortcuts) - keep this list in sync with it.
- Global: `Ctrl/Cmd+K` command palette, `?` shortcut help, `Ctrl/Cmd+Z` undo last tier edit.
- Tier board: `/` search, `n` / `N` next/previous match, `Enter` play match (or step), `Esc` close search, `Shift+P` push to YouTube (any board page).
- Tier page: `/` filter, `Esc` clear the filter.
- Player: `h` / `l` prev/next track, `←`/`→` seek 10s (expanded), `Space` play/pause, `m` mute, `0`-`9` jump to that 10%, `j` minimize (expanded → mini → floating), `k` expand, `Esc` minimize from expanded, `Shift+1`-`9` rate the playing video (any mode, on its board).
- Duel: `←` / `→` pick left/right, `Space` skip, `u` undo.

## Architecture
- React (Vite) frontend + Spring Boot (Java 21, Maven) backend, fully separated.
- Dockerized: `docker-compose.yml` (prod-style multi-stage builds) and `docker-compose.local.yml` (dev, volume-mounted for live editing).
