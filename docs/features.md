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

## Add songs (bringing a new song in)
- `/add` (sidebar "Add songs", `a` from anywhere, Home's "Add songs" button, command palette): **paste a YouTube / YouTube Music link** - or several at once (one per line / space-separated; watch, youtu.be, music, shorts links). Links only: there is no YouTube search, since a search costs 100 API quota units and a pasted link 1.
- **`Ctrl+V` with a link on any page** (outside a text box) adds it and opens Add songs; anything that isn't a link says so.
- Each added song becomes a card: cover (click / `Enter` to listen in the mini player), song + artist, the **board guessed from the artist** (from boards already loaded this session; else where the last one went; `b` / the picker changes it) and big tier buttons: `Shift+1`-`5` (same key as rating anywhere else; plain digits still seek) puts it straight into that tier on YouTube, `t` "Later" = the board's TODO list. `s` skips, `x` removes it from the waiting list, `/` or `a` back to the input. Putting the playing song in a tier plays the next waiting one.
- A song it knows is already in a tier shows "Already in <board> · <tier>" with Open it / Dismiss; one that slips through is auto-deduped when its board is opened.
- "Waiting" strip (click to jump) and an "Added this session" list with per-row Undo; `u` / `Ctrl+Z` / the toast's Undo takes the last one out of its playlist again.
- Errors say what YouTube actually said (daily quota used up, login expired, video not found) instead of a generic failure.

## Sidebar
- Brand, "Jump to… ⌘K" (command palette), Home, Add songs (with a count of songs waiting for a tier), and every board with its video total (from playlist item counts - no per-board fetch). Filter box, empty-state hint explaining the playlist naming convention.
- Footer: Settings, Keyboard shortcuts (`?`), Log out. On narrow screens the sidebar is a drawer opened from a burger button.

## Tier boards (the tier list)
- Playlists named `[G]/[GA]/[OG] <Category> T1/T2/T3/TE/TZ` are auto-grouped into a per-category tier board (plus an optional `<Category> TODO` list - see below).
- **Whole board on one screen, filling it**: the board measures the height left under the header (above the mini player and footer) and turns it into lines of square album-art tiles. Every tier gets one line, and each spare line goes to the tier hiding the most songs, so big tiers show 2+ lines while small ones stay compact. Whatever still doesn't fit folds into a **"+N show all"** tile. It re-fits live on window resize and when the mini player opens or closes; when even one line per tier (+ TODO) doesn't fit at full size, the tiles shrink (down to 60px) so the whole board, TODO row included, still fits; it only scrolls below that.
- Every tile prints its **song name** (and the artist, on desktop) over the bottom of the cover, so songs sharing one album cover are tellable apart without hovering. Names come from the video title with the "(Official Video)"/"[Lyrics]"/"| Album" noise stripped; "Artist - Song" titles are split into song + artist, otherwise the channel is the artist. Tiles stay square (88px desktop, 64px phone; one-line name on phones).
- Each row's colored label shows the tier, its count (or `matches/total` while searching), **Play this tier** (queues only that tier: "Playing from Rap · T2") and **Shuffle this tier**; the header's Play plays the whole board in tier order; clicking the label or the **"+N show all"** tile opens that tier's full list page. The **chevron column on the right of every row expands it in place** (`⌄`) to every song in the tier (wrapping onto as many lines as it needs; the page scrolls) and folds it back (`⌃`) - always the same spot, level with the row's first line, and pinned while you scroll down a long tier; dimmed when the whole tier already fits. Rows start folded again when you open another board.
- **Rename a board by clicking its name**, in place like an Office document name: the title reads as plain text, a faint outline fades in on hover ("Rename" tooltip), a click edits it right there in the same font with the text selected (the box grows with the text), `Enter` or clicking away saves, `Esc` cancels. A name that can't be used shows why in a red tooltip while you type (and reverts on save). Saving shows every playlist's `old -> new` name (the naming template with the new board name; the TODO list too) and the quota cost, then renames them on YouTube and moves the page to the new board's URL. Blocked while the board has staged changes, when another board already has that name, or when a new name wouldn't read back as this board under the template. A hand-assigned TODO list keeps its assignment.
- Header: board name, "N videos · M tiers", a labelled **tier-mix bar** (segment per tier, hover for count, click to open that tier), and actions: Find (`/`), Duel, Play (from the top tier) and Shuffle (whole board).
- Tiles: click plays, drag moves, hover/focus reveals a play affordance and a `⋯` menu (**Move to** any tier, **Top / Bottom of** this tier, **Open on YouTube**). Full title on hover tooltip.
- The playing video is marked (accent ring + animated equalizer) - only on the board it was opened from.
- Loading rows show Mantine `Skeleton`s; empty rows show a drop target.
- While the playlists list itself is still loading (right after login / a refresh), the sidebar and the board show skeleton placeholders instead of "0 tier lists" / "0 videos · 0 tiers".
- Vim-style `/` search (also the Find button): `/` opens a find box at the top of the screen (the `/` is part of the box's text - deleting it cancels), each row filters to its matches (and wraps to show all of them), `Enter`/`n` next match, `Shift+Enter`/`N` previous, `Enter` on a single match plays it, `Esc` closes. The active match is scrolled into view and highlighted. Matches song title, channel **and artist name**; every word must match, in any order, ignoring case and accents (`krsna makasam`, `beyonce`).

## TODO list (songs waiting for a tier)
- A board can have a **TODO playlist**: its inbox - save songs there on YouTube, then decide their tier here.
- **How a playlist becomes one** (Settings -> Playlist naming -> **To-do lists**): its name contains the **keyword** (default `TODO`, changeable - words of letters/digits, not a tier code) as a whole word, anywhere, any case. The rest of the name, once the keyword is taken out, must be a board's name - optionally with that board's tag; punctuation, brackets, `_` and case are ignored. So `[G] Rap TODO`, `TODO - Rap`, `rap todo`, `Todo: Rap`, `[G] Jazz Cozy todo` (board `Jazz_Cozy`) all work. Any other name (`My TODO stuff`) can be **assigned to a board by hand** in that table (or back to "Automatic"). A board uses one: a hand-assigned list beats a name match, then the first wins; the table shows every candidate's status (found / linked / not used - board already has one / no board / board doesn't exist). The keyword and the assignments are saved to your account. To-do lists **follow the naming template too**: the template's preview and rename job include them, with the keyword in `{tier}`'s place and the board's tag in `{tag}`'s (template `[Tierlist.fm] {category} {tier}` renames `Rap TODO` -> `[Tierlist.fm] Rap TODO`), and a name in that shape is recognised as the board's to-do list. New to-do lists are created with the same shape.
- On the board it's its own card **under the tiers** (below TZ; neutral grey, "N to do" in the header); it's excluded from the tier-mix bar, the "N videos" total and duels (it isn't ranked). Every move menu, row chip set, tier tab and the Tier Rail (a small TODO slot at the bottom) include it, so a song can be sent back to TODO too.
- **Triage** (header button, the TODO row's play button, the TODO page's button, or the palette's "Triage the <board> TODO list"): plays the TODO songs in order; giving the playing song a tier - player chips / `Shift+1-5`, the rail, a menu, a drag - moves it and starts the next to-do song (songs already rated some other way are skipped). The player shows a "Triage" badge.
- The TODO tier page (`/tier/<board>/t/TODO`) is the list view of the same thing: click a row's tier chip to rate it.
- If a song is both in TODO and a real tier, the rated copy wins and the TODO copy is staged as a duplicate removal.
- A board without one shows **Add a TODO list**: pick an existing playlist with the keyword that isn't in use (it gets assigned to this board), or create a new one (named by the template with the keyword in the tier's place, e.g. `[G] Rap TODO`); New tier list can create it too. The sidebar shows each board's to-do count as a small grey badge.

## Tier Rail
- A permanent strip of the board's tiers down the right edge of the tier list and tier pages (desktop), with live counts. **Global like the player:** while a song plays, the rail stays on Home, Settings and playlist pages too, showing the playing song's board so you can still rate it there (hidden only on the duel screen). One click does the most useful thing available: **re-rate the playing song** into that tier (when it's from this board; the playing song's art sits on its current tier, with `⇧1-5` hints) → otherwise **open that tier**. The header says which mode it's in ("Rate" / "Tiers").
- Every rail tier is a drop target: drag any tile or row onto it to move it there.
- Layout: the ranked tiers T1–TZ share the whole height of the rail; under a divider sit two equal slots for what isn't a tier - the board's **TODO** list (if it has one) and **Remove** (red outline like the player's Remove chip; shows how many are staged, and a `Del` hint while a song from this board plays). Both are drop targets; clicking Remove stages the playing song's removal.

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
- **Remove from a playlist** (no Remove row on the board - it's kept out of the tier list): drop a song on the Tier Rail's trash slot (under the tiers; it shows how many are staged), pick **Remove from playlist** in a tile's/row's `⋯` menu, or use the player - a red **Remove** chip at the end of the Rate chips (expanded; same shape as the tier chips, with its `Del` hint), a red trash chip beside the mini bar's tier chips, or the **Delete** key (any player mode, on its board); clicking the rail's trash while a song plays does the same. In a triage session removing the to-do song moves on to the next one. It's staged for deletion. It's a pending change like any move: the toast says "will be removed on push", it's listed as `tier → Removed` in the review (with put-back), Undo/Ctrl+Z/Discard or the review's Put back bring it back. Push deletes that playlist item on YouTube. Removing the top copy of a duplicated song keeps the next copy down (no extra auto-dedupe).
- A floating **staged-changes bar** (bottom-center, above the mini player) appears on every page of a board (tier list, tier page) whenever there are staged changes: "N changes staged · review" / "Discard" / "Push to YouTube ⇧P". Compact on phones. After a push it briefly reports "Synced to YouTube" / "Some changes failed" / "Sync failed".
- **Review changes** (click "N changes staged · review"): a simple list - cover, song and artist, `from → to` tier chips (or "Duplicate removed"), and a **Put back** button per move (undoable); Discard all / Push to YouTube (`Shift+P`) at the bottom. Closes itself once nothing is left.
- Clicking "N changes staged" opens a popup (Mantine `Modal`) itemizing every staged change (video, from tier → to tier, or a duplicate removal - see below).
- "Push to YouTube" calls the backend, which inserts each video into its new playlist before removing it from the old one (so a failed delete never loses a video). Partial failures are reported per item.
- "Discard" reverts the board back to what's actually on YouTube.
- `Shift+P` pushes pending changes (only when there are any) from any board page, same as the button / palette action.

## Duplicate cleanup
- If the same video genuinely exists in two of a board's real tier playlists at once, the lower-tier copy is automatically staged as a pending removal (kept: the highest tier it's in; removed: every other copy) - no manual action needed to flag it.
- It shows up in the pending popup as "Remove from [TODO] · already in [T2]" (the copy going away, then the tier that keeps the song), and the tile is greyed out and tagged "Duplicate" (tooltip: removed on sync) until you sync.
- "Push to YouTube" actually deletes the redundant playlist entry (no bogus re-insert into the same playlist).

## Video focus modal
- Click any thumbnail to open a modal with a real, playable embedded YouTube player (via the official IFrame Player API — not a raw iframe), so playback failures (embedding disabled) are detected and shown with a clear fallback + "Open on YouTube" link.
- Keyboard shortcuts: `Esc` close, `←`/`→` or `h`/`l` (vim-style) to move prev/next, `Shift+1`–`Shift+N` to re-rate the current video (in every player mode - expanded, mini bar or floating - while you're on its board).
- Expanded view: a **YouTube-Music-style queue panel** beside the video, as tall as the player. Header: "Queue · Playing from <board / tier / TODO / Add songs>" and a Shuffle button (shuffles Up next). One scrolling timeline: songs already played above (dimmed; "N earlier" beyond the last 50), the playing song highlighted in place (equalizer on its cover), then **Up next**, one list: the songs you queued (a thin accent bar on the left) followed by the rest of what you started. **Drag any row, by the whole row, anywhere**: reorder Up next, drag a played song back down to hear it again, or drag an upcoming one up into the played list to skip it. **Click a cover (▶ on hover) or double-click a row to play it.** Jumping ahead moves the skipped songs up into the played list, and jumping back puts the later ones back. Hover × removes a row. It auto-scrolls to keep the playing song near the top. Plus on-screen transport controls (prev, back 10s, play/pause, forward 10s, next, volume) and a backdrop glow in the playing song's tier color.
- Queue behaviour (focusSlice): each queue row is its own entry, so the **same song can be queued more than once** (and replays). Play next puts a song at the top of Up next. Add to queue puts it after the songs you've already queued, before the rest of the board. Starting something new (Play, a tier, shuffle, triage, Add songs) **replaces the whole queue**, as YouTube Music does. The **repeat** button cycles off → all (loops the whole queue, in the order it was played) → one (loops the playing song).
- **Play next / Add to queue** (YouTube-Music-style) in every song's "…" menu: Play next puts the song at the top of Up next (right after the playing song), Add to queue after the songs you've already queued (before the rest of the board). It always adds a new entry, so the same song can be queued twice, even the one playing now. With nothing playing, it just starts playing in the mini bar.
- Mini bar (Spotify/YouTube-Music layout, three zones with the transport dead centre): **left** art + title/channel (click to expand); **centre** shuffle up-next · prev · play/pause · next · repeat; a thin accent progress line runs along the bar's top edge (thickens on hover, click to seek); **right** the playing song's tier chips + Remove (click to re-rate), volume, floating corner, expand, stop. The bar is faintly tinted with the playing song's tier color. On phones shuffle/repeat and the floating toggle hide.
- **Volume is a vertical slider everywhere** (mini bar, floating corner, expanded), YouTube-style: click the speaker to mute, hover it for a vertical slider (with the level), mouse-wheel over it nudges ±5.
- Floating corner: video on top (expand/stop over it), then title, the same centred transport, volume/exit-floating, and the progress line along its bottom edge.
- Navigation walks the whole board in tier order — reaching the end of one tier's videos rolls straight into the next tier instead of stopping.
- The browsing order is frozen the moment the modal opens, so reassigning a video's tier mid-browse never disturbs where "next" takes you.
- When a video finishes playing, it automatically advances to the next one (same tier first, then the next tier).
- "Rate" tier chips under the expanded video show the current tier and re-rate with a click as well as a shortcut.

## Shuffle play
- The board's Shuffle button opens the player on a random video from the board and auto-advances through a shuffled order (a "Shuffle" badge marks the session). Each tier row / tier page also shuffles just that tier. "Play" / "Play from T2" plays in tier order instead.

## Command palette
- `Cmd/Ctrl+K` opens a fuzzy-searchable palette to jump straight to any tier board, tier, or playlist, or trigger contextual actions (start a duel, sync/discard pending changes) without leaving the keyboard.
- It also opens every page and Settings tab (**Go to**: Home, Add songs, Settings, Settings → Appearance / Playlist naming & to-do lists / Duels / Keyboard shortcuts, Show keyboard shortcuts) and Log out. Each carries search keywords, so `sett`, `theme`, `dark mode`, `todo`, `rename`, `elo` or `inbox` find the right one.

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
- Global: `Ctrl/Cmd+K` command palette, `?` shortcut help, `Ctrl/Cmd+Z` undo last tier edit, `Ctrl+V` paste YouTube link(s) (outside a text box) to add them via Add songs.
- Navigation (Vimium-style, anywhere outside a text box): `f` **link hints** - every visible clickable gets a letter label, type it to click/focus (`Backspace` edits, `Esc`/scroll/click cancels); `o` command palette; `a` Add songs; `g h` Home, `g s` Settings, `g u` up one level (tier page → board → Home), `g b` this board, `g p` playing song's board, `g t` its TODO list, `g d` duel; `[` / `]` previous/next board; `H` / `L` back/forward; `g g` / `G` top/bottom; `y y` copy the playing song's YouTube link. The key after a `g`/`y` prefix is never also taken by a page shortcut.
- Add songs: `Shift+1`-`5` put in T1…TZ, `t` save to TODO, `Enter` listen, `s` skip, `x` remove, `b` pick board, `/` or `a` the input, `u` / `Ctrl+Z` undo.
- Tier board: `/` search, `n` / `N` next/previous match, `Enter` play match (or step), `Esc` close search, `Shift+P` push to YouTube (any board page).
- Tier page: `/` filter, `Esc` clear the filter.
- Player: `h` / `l` prev/next track, `←`/`→` seek 10s (expanded), `Space` play/pause, `m` mute, `0`-`9` jump to that 10%, `j` minimize (expanded → mini → floating), `k` expand, `Esc` minimize from expanded, `Shift+1`-`9` rate the playing video (any mode, on its board), `Del` remove it from its playlist (staged until push).
- Duel: `←` / `→` pick left/right, `Space` skip, `u` undo.

## Architecture
- React (Vite) frontend + Spring Boot (Java 21, Maven) backend, fully separated.
- Dockerized: `docker-compose.yml` (prod-style multi-stage builds) and `docker-compose.local.yml` (dev, volume-mounted for live editing).
