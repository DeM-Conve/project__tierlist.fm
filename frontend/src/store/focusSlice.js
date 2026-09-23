import { createSlice, nanoid } from '@reduxjs/toolkit';

// The player's queue, modelled on YouTube Music's: one timeline.
//
//   history   (already played, oldest first)
//   current   (the playing entry)
//   upcoming  (everything still to play - one list, "Up next")
//
// Every entry is { key, tier, video, source }. `key` is unique per entry
// (not the video id), so the same song can be queued more than once.
// `source` only decides where "Add to queue" lands: 'user' entries (Play
// next / Add to queue, or anything you drag into place) form the front of
// `upcoming`; Add to queue goes after the last of them, before the rest of
// the board you started ('context' entries). The list itself is shown and
// edited as one - drag anything anywhere, including played songs back in.
//
// Each entry carries a { tier, video } snapshot taken when it was queued,
// so the dock keeps working when you navigate to a different board (a
// board's `tiersSlice.tierItems` only holds the loaded category).
// Starting something new replaces the whole queue, as YouTube Music does.

const HISTORY_LIMIT = 200;

function makeEntry({ tier, video }, source) {
  return { key: nanoid(), tier, video, source };
}

// `focusedVideo` ({ tier, videoId }) mirrors `current` for the many
// consumers that only need to know what's playing (rail, board marker,
// tier moves, triage).
function sync(state) {
  state.focusedVideo = state.current ? { tier: state.current.tier, videoId: state.current.video.videoId } : null;
}

function pushHistory(state, entry) {
  state.history.push(entry);
  if (state.history.length > HISTORY_LIMIT) state.history.splice(0, state.history.length - HISTORY_LIMIT);
}

// Where "Add to queue" inserts: after the run of your own songs at the front.
function userRunLength(upcoming) {
  let n = 0;
  while (n < upcoming.length && upcoming[n].source === 'user') n++;
  return n;
}

// Starts a new "playing from" context: `queue` (video ids, in play order)
// resolved against `entries` ({ tier, video } snapshots). Songs before the
// starting one show above it, like clicking a song halfway down a playlist
// in YouTube Music.
function startContext(state, { tier, videoId, queue, entries, category, label }) {
  const lookup = new Map(entries.map((e) => [e.video.videoId, e]));
  const ordered = queue.map((id) => lookup.get(id)).filter(Boolean);
  let start = ordered.findIndex((e) => e.video.videoId === videoId);
  if (start < 0) {
    const own = lookup.get(videoId);
    if (!own) return false;
    ordered.unshift(own);
    start = 0;
  }
  const made = ordered.map((e) => makeEntry(e, 'context'));
  state.history = made.slice(0, start);
  state.current = { ...made[start], tier: tier ?? made[start].tier };
  state.upcoming = made.slice(start + 1);
  state.focusedCategory = category;
  state.contextLabel = label ?? category ?? null;
  return true;
}

const focusSlice = createSlice({
  name: 'focus',
  initialState: {
    // { tier, videoId } of `current`, or null - see sync().
    focusedVideo: null,
    history: [],
    current: null,
    upcoming: [],
    // What was started ("Rap", "Rap · T2 · shuffle", "Rap · TODO", ...),
    // shown as "Playing from" in the queue panel.
    contextLabel: null,
    // The tier-board category playback was started from. Tier reassignment
    // (the pills/Shift+digit) writes into `tiersSlice.tierItems`, which only
    // holds the loaded category, so `selectFocusedAvailableTiers` only shows
    // those controls while this matches the board being viewed.
    focusedCategory: null,
    isShuffling: false,
    // YouTube Music's repeat button: 'off' -> 'all' (loop the whole queue)
    // -> 'one' (loop the playing song). Kept across queues.
    repeatMode: 'off',
    // Working through a board's TODO list: the queue is just the to-do
    // songs, and rating the playing one moves straight on to the next.
    isTriage: false,
    // 'expanded' (full-screen), 'mini' (bottom bar), or 'floating' (small
    // corner box) - see PlayerDock's j/k state machine.
    playerMode: 'expanded',
  },
  reducers: {
    openFocus: (state, action) => {
      if (!startContext(state, action.payload)) return;
      state.isShuffling = false;
      state.isTriage = !!action.payload.triage;
      // Add songs passes 'mini' so its card stays in view while listening;
      // everything else opens full-screen.
      state.playerMode = action.payload.mode ?? 'expanded';
      sync(state);
    },
    startShuffle: (state, action) => {
      if (!startContext(state, action.payload)) return;
      state.isShuffling = true;
      state.isTriage = false;
      state.playerMode = 'expanded';
      sync(state);
    },
    closeFocus: (state) => {
      state.history = [];
      state.current = null;
      state.upcoming = [];
      state.contextLabel = null;
      state.focusedCategory = null;
      state.isShuffling = false;
      state.isTriage = false;
      state.playerMode = 'expanded';
      sync(state);
    },
    minimizePlayer: (state) => {
      state.playerMode = 'mini';
    },
    expandPlayer: (state) => {
      state.playerMode = 'expanded';
    },
    floatPlayer: (state) => {
      state.playerMode = 'floating';
    },
    cycleRepeat: (state) => {
      state.repeatMode = state.repeatMode === 'off' ? 'all' : state.repeatMode === 'all' ? 'one' : 'off';
    },
    // At the end with repeat-all on, the whole queue starts over from the
    // top, in the order it was played.
    playNextInQueue: (state) => {
      const next = state.upcoming.shift();
      if (!next) {
        if (state.repeatMode !== 'all' || !state.current || !state.history.length) return;
        const all = [...state.history, state.current];
        state.history = [];
        state.current = all[0];
        state.upcoming = all.slice(1).map((e) => ({ ...e, source: 'context' }));
        sync(state);
        return;
      }
      if (state.current) pushHistory(state, state.current);
      state.current = next;
      sync(state);
    },
    playPrevInQueue: (state) => {
      const prev = state.history.pop();
      if (!prev) return;
      if (state.current) state.upcoming.unshift(state.current);
      state.current = prev;
      sync(state);
    },
    // Play a row of the queue. It's one timeline with a "now" pointer:
    // jumping ahead moves the skipped songs up into history, jumping back
    // puts the later ones back in front of what's upcoming.
    jumpInQueue: (state, action) => {
      const { section, index } = action.payload;
      if (!state.current) return;
      if (section === 'history') {
        const target = state.history[index];
        if (!target) return;
        const after = state.history.splice(index).slice(1);
        state.upcoming.unshift(...after, state.current);
        state.current = target;
      } else {
        const target = state.upcoming[index];
        if (!target) return;
        pushHistory(state, state.current);
        state.upcoming.slice(0, index).forEach((e) => pushHistory(state, e));
        state.upcoming = state.upcoming.slice(index + 1);
        state.current = target;
      }
      sync(state);
    },
    // YouTube Music's "Play next" (right after the playing song) and "Add to
    // queue" (after the songs you've already queued, before the rest of the
    // board). Always a new entry - queuing a song twice plays it twice.
    // `entry` is a { tier, video } snapshot.
    enqueue: (state, action) => {
      const { entry, position } = action.payload;
      if (!state.current) return;
      const made = makeEntry(entry, 'user');
      state.upcoming.splice(position === 'next' ? 0 : userRunLength(state.upcoming), 0, made);
    },
    removeFromQueue: (state, action) => {
      const key = action.payload;
      state.history = state.history.filter((e) => e.key !== key);
      state.upcoming = state.upcoming.filter((e) => e.key !== key);
    },
    // Drag-and-drop anywhere between the played list and Up next: reorder
    // what's coming, or drag a played song back down to hear it again (and
    // an upcoming one up into "played" to skip it). A song dropped into Up
    // next counts as one you queued if it lands among/next to your own.
    moveInQueue: (state, action) => {
      const { from, to } = action.payload;
      const lists = { history: state.history, upcoming: state.upcoming };
      if (!lists[from.section] || !lists[to.section]) return;
      const [moved] = lists[from.section].splice(from.index, 1);
      if (!moved) return;
      if (to.section === 'upcoming') {
        moved.source = to.index <= userRunLength(state.upcoming) ? 'user' : 'context';
      }
      lists[to.section].splice(to.index, 0, moved);
    },
    // Shuffle what's coming: `keys` is the new order of the upcoming
    // entries (the random permutation is made by the caller, so this
    // reducer stays pure).
    reorderUpcoming: (state, action) => {
      const byKey = new Map(state.upcoming.map((e) => [e.key, e]));
      state.upcoming = action.payload.map((k) => byKey.get(k)).filter(Boolean);
      state.isShuffling = true;
    },
    // Two uses, both kept from before the queue became entry-based:
    //  - same song as `current`: its tier changed (a rating) - update it;
    //  - a different song: play the first upcoming entry of it (triage
    //    moving on to the next to-do song).
    setFocusedVideo: (state, action) => {
      const { tier, videoId } = action.payload;
      if (!state.current) return;
      if (state.current.video.videoId !== videoId) {
        const index = state.upcoming.findIndex((e) => e.video.videoId === videoId);
        if (index < 0) return;
        focusSlice.caseReducers.jumpInQueue(state, { payload: { section: 'upcoming', index } });
      }
      if (tier !== undefined) state.current.tier = tier;
      sync(state);
    },
  },
});

export const {
  openFocus,
  closeFocus,
  minimizePlayer,
  expandPlayer,
  floatPlayer,
  startShuffle,
  cycleRepeat,
  playNextInQueue,
  playPrevInQueue,
  jumpInQueue,
  enqueue,
  removeFromQueue,
  moveInQueue,
  reorderUpcoming,
  setFocusedVideo,
} = focusSlice.actions;
export default focusSlice.reducer;
