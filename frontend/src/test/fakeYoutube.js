// A fake YouTube (plus the thin backend in front of it) for sync tests.
//
// YouTube is modelled as playlists -> ordered playlistItems { id, videoId }.
// Every insert mints a fresh playlistItem id (like YouTube), deleting an id
// that isn't there is a 404 (like YouTube). On top of that, `adapter` is an
// axios adapter that answers the backend routes the frontend calls
// (src/api/queries.js) the way PlaylistController does - so a test installs
// it on the app's one axios instance (`api.defaults.adapter`) and the real
// store, tierActions, syncPlan and React Query code all run unchanged.
//
// tier-sync answers in the new per-result contract:
// { videoId, success, inserted, removed, newItemId?, step?, error? } (fix/sync-backend).

const ok = (config, data, status = 200) => ({ data, status, statusText: 'OK', headers: {}, config, request: {} });

function httpError(config, status, detail) {
  const err = new Error(`Request failed with status code ${status}`);
  err.isAxiosError = true;
  err.config = config;
  err.response = { status, data: { detail }, headers: {}, config };
  return err;
}

class YoutubeError extends Error {
  constructor(status, reason) {
    super(`${status} ${reason}`);
    this.status = status;
    this.reason = reason;
  }
}

export class FakeYoutube {
  // playlists: { [title]: videoId[] } - each becomes a playlist `pl-<n>`.
  constructor(playlists = {}, { userId = 'user-1' } = {}) {
    this.userId = userId;
    this.playlists = new Map(); // id -> { id, title, items: [{ id, videoId }] }
    this.titles = new Map(); // videoId -> title
    this.nextItem = 1;
    this.nextPlaylist = 1;
    this.faults = []; // [{ op, videoId?, playlistId?, itemId?, status, reason, times }]
    this.requestFaults = []; // [{ method, url, status, detail, times }]
    this.log = []; // every request: { method, url, body }
    this.syncCalls = []; // every tier-sync: { payload, response }
    for (const [title, videoIds] of Object.entries(playlists)) this.addPlaylist(title, videoIds);
    this.adapter = this.adapter.bind(this);
  }

  addPlaylist(title, videoIds = []) {
    const id = `pl-${this.nextPlaylist++}`;
    this.playlists.set(id, { id, title, items: [] });
    videoIds.forEach((v) => this.insert(id, v));
    return id;
  }

  idOf(title) {
    for (const p of this.playlists.values()) if (p.title === title) return p.id;
    throw new Error(`no playlist "${title}"`);
  }

  // Ordered video ids of a playlist, by id or title.
  videos(idOrTitle) {
    const p = this.playlists.get(idOrTitle) ?? this.playlists.get(this.idOf(idOrTitle));
    return p.items.map((i) => i.videoId);
  }

  // { [title]: videoId[] } - the whole account.
  snapshot() {
    return Object.fromEntries([...this.playlists.values()].map((p) => [p.title, p.items.map((i) => i.videoId)]));
  }

  // Fail the next `times` matching YouTube writes (op: 'insert' | 'delete').
  inject({ op, videoId, playlistId, itemId, status = 500, reason = 'backendError', times = 1 }) {
    this.faults.push({ op, videoId, playlistId, itemId, status, reason, times });
  }

  // Fail the next `times` requests to `url` (e.g. '/api/tier-sync') as a
  // whole - the server down, or answering 5xx before doing anything.
  failRequest({ method = 'post', url, status = 503, detail = 'The server is unavailable', times = 1 }) {
    this.requestFaults.push({ method, url, status, detail, times });
  }

  fault(op, { videoId, playlistId, itemId }) {
    const f = this.faults.find(
      (x) =>
        x.times > 0 &&
        x.op === op &&
        (x.videoId == null || x.videoId === videoId) &&
        (x.playlistId == null || x.playlistId === playlistId) &&
        (x.itemId == null || x.itemId === itemId)
    );
    if (!f) return;
    f.times -= 1;
    throw new YoutubeError(f.status, f.reason);
  }

  title(videoId) {
    return this.titles.get(videoId) ?? `Song ${videoId}`;
  }

  item(i) {
    return { id: i.id, videoId: i.videoId, title: this.title(i.videoId), channelTitle: `Artist ${i.videoId}`, thumbnail: null };
  }

  // ---- YouTube's own operations ----------------------------------------

  insert(playlistId, videoId) {
    const p = this.playlists.get(playlistId);
    if (!p) throw new YoutubeError(404, 'playlistNotFound');
    this.fault('insert', { videoId, playlistId });
    const item = { id: `item-${this.nextItem++}`, videoId };
    p.items.push(item);
    return item;
  }

  delete(itemId) {
    for (const p of this.playlists.values()) {
      const i = p.items.findIndex((x) => x.id === itemId);
      if (i < 0) continue;
      this.fault('delete', { videoId: p.items[i].videoId, playlistId: p.id, itemId });
      p.items.splice(i, 1);
      return;
    }
    throw new YoutubeError(404, 'playlistItemNotFound');
  }

  // ---- The backend (PlaylistController) ---------------------------------

  // POST /api/tier-sync, as PlaylistController.tierSync (fix/sync-backend):
  // per row, insert into toPlaylistId (if any), then delete fromItemId (if
  // any); a source item that's already gone (404) counts as removed. Rows
  // repeating an earlier row's work (same fromItemId, or insert-only of the
  // same video into the same playlist) aren't run twice. One failure never
  // aborts the batch. Result: { videoId, success, inserted, removed,
  // newItemId (only when inserted), step + error (only on failure) }.
  tierSync(rows) {
    const text = (x) => (x == null || String(x).trim() === '' ? null : String(x));
    const key = (row) => {
      if (text(row.fromItemId)) return `from:${row.fromItemId}`;
      if (text(row.toPlaylistId)) return `new:${row.videoId}\n${row.toPlaylistId}`;
      return null;
    };
    const firstRow = new Map();
    const results = [];
    rows.forEach((row, i) => {
      const k = key(row);
      if (k != null && firstRow.has(k)) {
        const j = firstRow.get(k);
        if (text(row.toPlaylistId) === text(rows[j].toPlaylistId)) results.push({ ...results[j], videoId: row.videoId });
        else {
          results.push({
            videoId: row.videoId, success: false, inserted: false, removed: results[j].removed, step: 'insert',
            error: 'This song was already moved to another tier in this push - only that move was made.',
          });
        }
        return;
      }
      if (k != null) firstRow.set(k, i);
      results.push(this.moveOne(row, text));
    });
    return { applied: results.filter((r) => r.success).length, total: results.length, results };
  }

  // PlaylistController.retry: up to 4 attempts. Deletes (safe to repeat) retry
  // 409/5xx (retryTransient); inserts only 409 (a 500'd insert may have landed).
  retry(write, retryable) {
    for (let attempt = 1; ; attempt++) {
      try {
        return write();
      } catch (e) {
        if (attempt >= 4 || !(e instanceof YoutubeError) || !retryable(e)) throw e;
      }
    }
  }

  moveOne(row, text) {
    const finish = (success, inserted, removed, newItemId, step, error) => {
      const r = { videoId: row.videoId, success, inserted, removed };
      if (inserted) r.newItemId = newItemId;
      if (step) Object.assign(r, { step, error });
      return r;
    };
    let inserted = false;
    let newItemId = null;
    if (text(row.toPlaylistId)) {
      try {
        newItemId = this.retry(() => this.insert(row.toPlaylistId, row.videoId), (e) => e.status === 409).id;
        inserted = true;
      } catch (e) {
        return finish(false, false, false, null, 'insert', e.message);
      }
    }
    let removed = false;
    if (text(row.fromItemId)) {
      try {
        this.retry(() => this.delete(row.fromItemId), (e) => e.status === 409 || e.status >= 500);
        removed = true;
      } catch (e) {
        if (e.status === 404) removed = true;
        else return finish(false, inserted, false, newItemId, 'delete', e.message);
      }
    }
    return finish(true, inserted, removed, newItemId, null, null);
  }

  async adapter(config) {
    const method = (config.method || 'get').toLowerCase();
    const url = config.url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/, '/');
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    this.log.push({ method, url, body });
    // A real round trip is async; one macrotask keeps React Query's timing honest.
    await new Promise((r) => setTimeout(r, 0));
    const down = this.requestFaults.find((f) => f.times > 0 && f.method === method && f.url === url);
    if (down) {
      down.times -= 1;
      throw httpError(config, down.status, down.detail);
    }
    try {
      return this.route(config, method, url, body);
    } catch (e) {
      if (e instanceof YoutubeError) throw httpError(config, e.status === 403 ? 429 : e.status, e.message);
      throw e;
    }
  }

  route(config, method, url, body) {
    let m;
    if (method === 'get' && url === '/api/auth/status') return ok(config, { loggedIn: true, userId: this.userId });
    if (method === 'get' && url === '/api/playlists') {
      return ok(config, [...this.playlists.values()].map((p) => ({ id: p.id, title: p.title, thumbnail: null, itemCount: p.items.length })));
    }
    if (method === 'get' && (m = url.match(/^\/api\/playlists\/([^/]+)\/items$/))) {
      const p = this.playlists.get(decodeURIComponent(m[1]));
      if (!p) throw httpError(config, 404, 'Playlist not found');
      return ok(config, p.items.map((i) => this.item(i)));
    }
    if (method === 'post' && (m = url.match(/^\/api\/playlists\/([^/]+)\/items$/))) {
      return ok(config, this.item(this.insert(decodeURIComponent(m[1]), body.videoId)));
    }
    if (method === 'delete' && (m = url.match(/^\/api\/playlist-items\/([^/]+)$/))) {
      this.delete(decodeURIComponent(m[1]));
      return ok(config, '', 204);
    }
    if (method === 'post' && url === '/api/tier-sync') {
      const response = this.tierSync(body);
      this.syncCalls.push({ payload: body, response });
      return ok(config, response);
    }
    if (method === 'get' && (m = url.match(/^\/api\/videos\/([^/]+)$/))) {
      const videoId = decodeURIComponent(m[1]);
      return ok(config, { videoId, title: this.title(videoId), channelTitle: `Artist ${videoId}`, thumbnail: null });
    }
    if (method === 'get' && url === '/api/settings') return ok(config, '', 204);
    if (method === 'put' && url === '/api/settings') return ok(config, body);
    // A board no one has duelled on yet (the duel hub renders it).
    if (method === 'post' && url.startsWith('/api/duels/analysis')) {
      return ok(config, { certainty: 0, duelsTotal: 0, onFence: 0, activeSession: null, borders: [], songs: [], suggestions: [], tierOrders: {} });
    }
    if (url.startsWith('/api/duels/')) return ok(config, {});
    throw httpError(config, 404, `fake YouTube: no route for ${method.toUpperCase()} ${url}`);
  }
}
