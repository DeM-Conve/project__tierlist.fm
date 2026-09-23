import { createSlice } from '@reduxjs/toolkit';
import { SETTINGS, getSetting } from '../settings';
import { DEFAULT_TEMPLATE, validateTemplate } from '../naming';

// The playlist naming template (see naming.js). `migratingFrom` is set while
// a rename job hasn't finished for every playlist: titles matching EITHER
// template are recognised meanwhile, so a partial failure never makes boards
// vanish. Persisted to localStorage by store.js.
const saved = getSetting(SETTINGS.naming, null);
const initialState =
  saved && typeof saved.template === 'string' && validateTemplate(saved.template).length === 0
    ? { template: saved.template, migratingFrom: saved.migratingFrom ?? null }
    : { template: DEFAULT_TEMPLATE, migratingFrom: null };

const namingSlice = createSlice({
  name: 'naming',
  initialState,
  reducers: {
    // Switch templates without renaming anything on YouTube.
    setTemplate: (state, action) => {
      state.template = action.payload;
      state.migratingFrom = null;
    },
    startMigration: (state, action) => {
      const { from, to } = action.payload;
      state.migratingFrom = from;
      state.template = to;
    },
    finishMigration: (state) => {
      state.migratingFrom = null;
    },
  },
});

export const { setTemplate, startMigration, finishMigration } = namingSlice.actions;
export default namingSlice.reducer;
