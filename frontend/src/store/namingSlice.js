import { createSlice } from '@reduxjs/toolkit';
import { SETTINGS, getSetting } from '../settings';
import { DEFAULT_TEMPLATE, normalizeTemplate, validateTemplate } from '../naming';

// The playlist naming template (see naming.js). `migratingFrom` is set while
// a rename job hasn't finished for every playlist: titles matching EITHER
// template are recognised meanwhile, so a partial failure never makes boards
// vanish. Persisted to localStorage by store.js.
// `needsDetection`: nobody has chosen a template yet on this browser, so the
// first playlist load picks the preset that fits the user's existing names
// (detectTemplate) instead of assuming everyone uses one convention.
const saved = getSetting(SETTINGS.naming, null);
const initialState =
  saved && typeof saved.template === 'string' && validateTemplate(saved.template).length === 0
    ? {
        template: normalizeTemplate(saved.template),
        migratingFrom: saved.migratingFrom ? normalizeTemplate(saved.migratingFrom) : null,
        needsDetection: !!saved.needsDetection,
      }
    : { template: DEFAULT_TEMPLATE, migratingFrom: null, needsDetection: true };

const namingSlice = createSlice({
  name: 'naming',
  initialState,
  reducers: {
    // Switch templates without renaming anything on YouTube.
    setTemplate: (state, action) => {
      state.template = action.payload;
      state.migratingFrom = null;
      state.needsDetection = false;
    },
    detectedTemplate: (state, action) => {
      if (!state.needsDetection) return;
      state.template = action.payload;
      state.needsDetection = false;
    },
    startMigration: (state, action) => {
      const { from, to } = action.payload;
      state.migratingFrom = from;
      state.template = to;
      state.needsDetection = false;
    },
    finishMigration: (state) => {
      state.migratingFrom = null;
    },
  },
});

export const { setTemplate, detectedTemplate, startMigration, finishMigration } = namingSlice.actions;
export default namingSlice.reducer;
