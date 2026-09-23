import { createSlice } from '@reduxjs/toolkit';
import { SETTINGS, getSetting } from '../settings';
import { DEFAULT_DUEL_STRATEGY, DUEL_STRATEGIES } from '../duel';
import { settingsLoaded } from './settingsActions';

// Tier board layout: every song (rows wrap) or one line per tier with a
// "+N" tile. Keys match the backend BoardDensity enum.
export const BOARD_DENSITIES = ['all', 'compact'];

// Small user preferences that aren't appearance or naming (default duel
// strategy, board layout). Persisted like the other settings slices.
function resolvePrefs(saved) {
  return {
    duelStrategy: DUEL_STRATEGIES[saved?.duelStrategy] ? saved.duelStrategy : DEFAULT_DUEL_STRATEGY,
    boardDensity: BOARD_DENSITIES.includes(saved?.boardDensity) ? saved.boardDensity : BOARD_DENSITIES[0],
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
    setBoardDensity: (state, action) => {
      if (BOARD_DENSITIES.includes(action.payload)) state.boardDensity = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(settingsLoaded, (state, action) => (action.payload.prefs ? resolvePrefs(action.payload.prefs) : state));
  },
});

export const { setDuelStrategy, setBoardDensity } = prefsSlice.actions;
export default prefsSlice.reducer;
