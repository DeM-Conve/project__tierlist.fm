import { createSlice } from '@reduxjs/toolkit';
import { SETTINGS, getSetting } from '../settings';
import { DEFAULT_TEMPLATE, normalizeTemplate, validateTemplate } from '../naming';
import { settingsLoaded } from './settingsActions';

// The playlist naming template (see naming.js). `migratingFrom` is set while
// a rename job hasn't finished for every playlist: titles matching EITHER
// template are recognised meanwhile, so a partial failure never makes boards
// vanish. Persisted to localStorage by store.js.
// `needsDetection`: nobody has chosen a template yet on this browser, so the
// first playlist load picks the preset that fits the user's existing names
// (detectTemplate) instead of assuming everyone uses one convention.
function fromSaved(saved) {
  return saved && typeof saved.template === 'string' && validateTemplate(saved.template).length === 0
    ? {
        template: normalizeTemplate(saved.template),
        migratingFrom: saved.migratingFrom ? normalizeTemplate(saved.migratingFrom) : null,
        needsDetection: !!saved.needsDetection,
      }
    : null;
}
const initialState = fromSaved(getSetting(SETTINGS.naming, null)) ?? {
  template: DEFAULT_TEMPLATE,
  migratingFrom: null,
  needsDetection: true,
};

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
  extraReducers: (builder) => {
    // The account already has a template -> use it (no detection needed).
    builder.addCase(settingsLoaded, (state, action) => {
      const saved = fromSaved(action.payload.naming);
      return saved ? { ...saved, needsDetection: false } : state;
    });
  },
});

export const { setTemplate, detectedTemplate, startMigration, finishMigration } = namingSlice.actions;
export default namingSlice.reducer;
