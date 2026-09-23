import { createSlice, nanoid } from '@reduxjs/toolkit';

// The player's queue, modelled on YouTube Music's. Every entry is
// { key, tier, video, source } - `key` is unique per entry (not the video
// id), so the same song can sit in the queue more than once. The play order
// is always:
//
//   history (already played, oldest first)
//   current (the playing entry)
//   upNext  (source 'user': songs you queued with Play next / Add to queue,
//            from anywhere in the app)
//   context (source 'context': the rest of what you started playing - a
//            board, one tier, a shuffle, the TODO list)
//
// Starting something new replaces the whole queue, your own songs
// included, the way YouTube Music does.
//
// Each entry carries a { tier, video } snapshot taken when it was queued,
// so the dock keeps working when you navigate to a different board (a
// board's `tiersSlice.tierItems` only holds the loaded category).

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

// Puts an entry back at the front of the section it came from (going
// backwards through the queue, or jumping back into history).
function returnToUpcoming(state, entry) {
  if (entry.source === 'user') state.upNext.unshift(entry);
  else state.context.unshift(entry);
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
  state.context = made.slice(start + 1);
  state.upNext = [];
  state.focusedCategory = category;
  state.contextLabel = label ?? category ?? null;
  return true;
}

const SECTIONS = ['upNext', 'context'];

const focusSlice = createSlice({
  name: 'focus',
  initialState: {
    // { tier, videoId } of `current`, or null - see sync().
    focusedVideo: null,
    history: [],
    current: null,
    upNext: [],
    context: [],
    // What `context` is ("Rap", "Rap · T2", "Rap · TODO", ...), shown as
    // "Playing from" / "Next from" in the queue panel.
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
    // Working through a board's TODO list: the context is just the to-do
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
      state.upNext = [];
      state.context = [];
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
    // Your queue first, then the context - same as YouTube Music. At the end
    // with repeat-all on, the whole queue starts over from the top.
    playNextInQueue: (state) => {
      let next = state.upNext.shift() ?? state.context.shift();
      if (!next && state.repeatMode === 'all' && state.current && state.history.length) {
        const all = [...state.history, state.current];
        state.history = [];
        state.current = all[0];
        // Replays in the order it was played; it's all one list again.
        state.upNext = [];
        state.context = all.slice(1).map((e) => ({ ...e, source: 'context' }));
        sync(state);
        return;
      }
      if (!next) return;
      if (state.current) pushHistory(state, state.current);
      state.current = next;
      sync(state);
    },
    playPrevInQueue: (state) => {
      const prev = state.history.pop();
      if (!prev) return;
      if (state.current) returnToUpcoming(state, state.current);
      state.current = prev;
      sync(state);
    },
    // Click a row in the queue panel. Jumping ahead moves the skipped songs
    // up into history (the list is one timeline with a "now" pointer);
    // jumping back returns the songs after it to the upcoming sections.
    jumpInQueue: (state, action) => {
      const { section, index } = action.payload;
      if (!state.current) return;
      if (section === 'history') {
        const target = state.history[index];
        if (!target) return;
        const after = state.history.splice(index);
        after.shift();
        [...after, state.current].reverse().forEach((e) => returnToUpcoming(state, e));
        state.current = target;
      } else {
        const list = state[section];
        const target = list?.[index];
        if (!target) return;
        const skipped = section === 'context' ? [...state.upNext, ...list.slice(0, index)] : list.slice(0, index);
        pushHistory(state, state.current);
        skipped.forEach((e) => pushHistory(state, e));
        if (section === 'context') state.upNext = [];
        state[section] = list.slice(index + 1);
        state.current = target;
      }
      sync(state);
    },
    // YouTube Music's "Play next" (top of your queue, right after the
    // playing song) and "Add to queue" (end of your queue, before the rest
    // of the context). Always a new entry - queuing a song twice plays it
    // twice. `entry` is a { tier, video } snapshot.
    enqueue: (state, action) => {
      const { entry, position } = action.payload;
      if (!state.current) return;
      const made = makeEntry(entry, 'user');
      if (position === 'next') state.upNext.unshift(made);
      else state.upNext.push(made);
    },
    removeFromQueue: (state, action) => {
      const key = action.payload;
      state.history = state.history.filter((e) => e.key !== key);
      state.upNext = state.upNext.filter((e) => e.key !== key);
      state.context = state.context.filter((e) => e.key !== key);
    },
    // Drag-and-drop between/within the two upcoming sections. An entry
    // dragged into "Up next" becomes one of yours (and survives starting a
    // new board); one dragged down into the context goes with it.
    moveInQueue: (state, action) => {
      const { from, to } = action.payload;
      if (!SECTIONS.includes(from.section) || !SECTIONS.includes(to.section)) return;
      const [moved] = state[from.section].splice(from.index, 1);
      if (!moved) return;
      moved.source = to.section === 'upNext' ? 'user' : 'context';
      state[to.section].splice(to.index, 0, moved);
    },
    clearUpNext: (state) => {
      state.upNext = [];
    },
    // Shuffle what's coming: `keys` is the new order of the context's
    // entries (the random permutation is made by the caller, so this
    // reducer stays pure).
    reorderContext: (state, action) => {
      const byKey = new Map(state.context.map((e) => [e.key, e]));
      state.context = action.payload.map((k) => byKey.get(k)).filter(Boolean);
      state.isShuffling = true;
    },
    // Two uses, both kept from before the queue became entry-based:
    //  - same song as `current`: its tier changed (a rating) - update it;
    //  - a different song: play the first upcoming entry of it (triage
    //    moving on to the next to-do song).
    setFocusedVideo: (state, action) => {
      const { tier, videoId } = action.payload;
      if (!state.current) return;
      if (state.current.video.videoId === videoId) {
        state.current.tier = tier;
        sync(state);
        return;
      }
      for (const section of SECTIONS) {
        const index = state[section].findIndex((e) => e.video.videoId === videoId);
        if (index >= 0) {
          focusSlice.caseReducers.jumpInQueue(state, { payload: { section, index } });
          state.current.tier = tier ?? state.current.tier;
          sync(state);
          return;
        }
      }
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
  playNextInQueue,
  playPrevInQueue,
  jumpInQueue,
  enqueue,
  removeFromQueue,
  moveInQueue,
  clearUpNext,
  reorderContext,
  cycleRepeat,
  setFocusedVideo,
} = focusSlice.actions;
export default focusSlice.reducer;
