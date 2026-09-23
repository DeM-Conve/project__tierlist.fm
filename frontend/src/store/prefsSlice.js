import { createSlice } from '@reduxjs/toolkit';
import { SETTINGS, getSetting } from '../settings';
import { DEFAULT_DUEL_STRATEGY, DUEL_STRATEGIES } from '../duel';
import { settingsLoaded } from './settingsActions';

// Small user preferences that aren't appearance or naming (currently the
// default duel strategy). Persisted like the other settings slices.
function resolvePrefs(saved) {
  return {
    duelStrategy: DUEL_STRATEGIES[saved?.duelStrategy] ? saved.duelStrategy : DEFAULT_DUEL_STRATEGY,
  };
}

// Older builds stored the duel strategy on its own key.
const legacyStrategy = getSetting(SETTINGS.duelStrategy, null);

const prefsSlice = createSlice({
  name: 'prefs',
  initialState: resolvePrefs(getSetting(SETTINGS.prefs, legacyStrategy ? { duelStrategy: legacyStrategy } : null)),
  reducers: {
    setDuelStrategy: (state, action) => {
      if (DUEL_STRATEGIES[action.payload]) state.duelStrategy = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(settingsLoaded, (state, action) => (action.payload.prefs ? resolvePrefs(action.payload.prefs) : state));
  },
});

export const { setDuelStrategy } = prefsSlice.actions;
export default prefsSlice.reducer;
