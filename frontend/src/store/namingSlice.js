import { createSlice } from '@reduxjs/toolkit';
import { SETTINGS, getSetting } from '../settings';
import { DEFAULT_TEMPLATE, NO_DISPLAY_NAMES, validateDisplayNames, validateTemplate, validateTierLabels } from '../naming';
import { DEFAULT_TIER_LABELS } from '../tiers';
import { settingsLoaded } from './settingsActions';

// The playlist naming (see naming.js): `template` + `tierLabels` (what each
// tier is called in playlist names) + `tierDisplayNames` (what the app shows,
// per tier; null = the same). `migratingFrom` / `migratingFromTierLabels` are the
// previous naming while a rename job hasn't finished for every playlist:
// titles matching EITHER naming are recognised meanwhile, so a partial
// failure never makes boards vanish. Persisted to localStorage by store.js.
// `needsDetection`: nobody has chosen a naming yet on this browser, so the
// first playlist load picks the one that fits the user's existing names
// (detectNaming) instead of assuming everyone uses one convention.
// `todoLinks` = { [playlistId]: category } for to-do lists assigned by hand
// (todoLists.js).
const validLabels = (l) => l && typeof l === 'object' && Object.keys(validateTierLabels(l)).length === 0;

function fromSaved(saved) {
  if (!saved || typeof saved.template !== 'string' || validateTemplate(saved.template).length) return null;
  // No tier names saved yet: the defaults, and detect from the playlists.
  const hasLabels = validLabels(saved.tierLabels);
  const tierLabels = hasLabels ? saved.tierLabels : DEFAULT_TIER_LABELS;
  const migratingFrom = saved.migratingFrom || null;
  const fromLabels = validLabels(saved.migratingFromTierLabels) ? saved.migratingFromTierLabels : null;
  return {
    template: saved.template,
    tierLabels,
    tierDisplayNames:
      saved.tierDisplayNames && !Object.keys(validateDisplayNames(saved.tierDisplayNames)).length
        ? { ...NO_DISPLAY_NAMES, ...saved.tierDisplayNames }
        : NO_DISPLAY_NAMES,
    // A half-finished rename always has both halves of the old naming.
    migratingFrom: migratingFrom || fromLabels ? migratingFrom ?? saved.template : null,
    migratingFromTierLabels: migratingFrom || fromLabels ? fromLabels ?? tierLabels : null,
    needsDetection: !!saved.needsDetection || !hasLabels,
    todoLinks: saved.todoLinks && typeof saved.todoLinks === 'object' ? saved.todoLinks : {},
  };
}
const initialState = fromSaved(getSetting(SETTINGS.naming, null)) ?? {
  template: DEFAULT_TEMPLATE,
  tierLabels: DEFAULT_TIER_LABELS,
  tierDisplayNames: NO_DISPLAY_NAMES,
  migratingFrom: null,
  migratingFromTierLabels: null,
  needsDetection: true,
  todoLinks: {},
};

const namingSlice = createSlice({
  name: 'naming',
  initialState,
  reducers: {
    // { template, tierLabels, tierDisplayNames } - nothing is renamed on YouTube.
    setNaming: (state, action) => {
      state.template = action.payload.template;
      state.tierLabels = action.payload.tierLabels;
      state.tierDisplayNames = action.payload.tierDisplayNames;
      state.migratingFrom = null;
      state.migratingFromTierLabels = null;
      state.needsDetection = false;
    },
    detectedNaming: (state, action) => {
      if (!state.needsDetection) return;
      state.template = action.payload.template;
      state.tierLabels = action.payload.tierLabels;
      state.needsDetection = false;
    },
    // { from, to }: both { template, tierLabels }.
    startMigration: (state, action) => {
      const { from, to } = action.payload;
      state.migratingFrom = from.template;
      state.migratingFromTierLabels = from.tierLabels;
      state.template = to.template;
      state.tierLabels = to.tierLabels;
      state.needsDetection = false;
    },
    finishMigration: (state) => {
      state.migratingFrom = null;
      state.migratingFromTierLabels = null;
    },
    // { playlistId, category } - category null = back to automatic.
    linkTodoList: (state, action) => {
      const { playlistId, category } = action.payload;
      if (category) state.todoLinks[playlistId] = category;
      else delete state.todoLinks[playlistId];
    },
  },
  extraReducers: (builder) => {
    // The account already has a naming -> use it (no detection needed).
    builder.addCase(settingsLoaded, (state, action) => {
      const saved = fromSaved(action.payload.naming);
      return saved ? { ...saved, needsDetection: saved.needsDetection && !action.payload.naming.tierLabels } : state;
    });
  },
});

export const { setNaming, detectedNaming, startMigration, finishMigration, linkTodoList } = namingSlice.actions;
export default namingSlice.reducer;
