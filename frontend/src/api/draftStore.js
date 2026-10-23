import { createStore, del, get, set } from 'idb-keyval';
import { hasIndexedDb } from './boardCache';

// Unpushed board drafts (store/draftsSlice.js) kept on this device across
// reloads, in IndexedDB through idb-keyval - the same rules as the board
// cache (boardCache.js): one account's (a different or unknown account's
// drafts are dropped, never shown), wiped on logout, dropped when a new build
// changes their shape (DRAFTS_SCHEMA), skipped where IndexedDB isn't there.
// Every call may fail (private mode, blocked store): a failed read is "no
// drafts", a failed write is skipped.
export const DRAFTS_SCHEMA = 1;
const KEY = 'board-drafts';
// Undo steps kept per board across a reload (each one is a whole board).
export const SAVED_UNDO_STEPS = 20;

function idbStorage() {
  let store;
  const db = () => (store ??= createStore('tierlistfm-drafts', 'drafts'));
  return {
    get: async () => {
      try { return await get(KEY, db()); } catch { return undefined; }
    },
    set: async (value) => {
      try { await set(KEY, value, db()); } catch { /* not saved this time */ }
    },
    clear: async () => {
      try { await del(KEY, db()); } catch { /* nothing to clear */ }
    },
  };
}

let storage = hasIndexedDb() ? idbStorage() : null;

export const draftStorageAvailable = () => storage !== null;

// Tests: an in-memory stand-in (or null for none).
export function setDraftStorage(next) {
  storage = next;
}

export function memoryDraftStorage() {
  let value;
  return {
    get: async () => value,
    set: async (v) => {
      value = structuredClone(v);
    },
    clear: async () => {
      value = undefined;
    },
    peek: () => value,
  };
}

// -> { [category]: board } saved by `owner`, or {} (and the saved copy is
// dropped when it's someone else's or from another build).
export async function loadDrafts(owner) {
  if (!storage) return {};
  const saved = await storage.get();
  if (!saved) return {};
  if (!owner || saved.owner !== owner || saved.schema !== DRAFTS_SCHEMA) {
    await storage.clear();
    return {};
  }
  return saved.boards || {};
}

export async function saveDrafts(owner, boards) {
  if (!storage || !owner) return;
  if (!Object.keys(boards).length) {
    await storage.clear();
    return;
  }
  const trimmed = Object.fromEntries(
    Object.entries(boards).map(([category, b]) => [
      category,
      { ...b, undoStack: (b.undoStack || []).slice(-SAVED_UNDO_STEPS), redoStack: (b.redoStack || []).slice(-SAVED_UNDO_STEPS) },
    ])
  );
  await storage.set({ owner, schema: DRAFTS_SCHEMA, boards: trimmed });
}

export async function clearDrafts() {
  await storage?.clear();
}
