import { createSlice } from '@reduxjs/toolkit';
import { SETTINGS, getSetting } from '../settings';
import { BORDER_MODES, isValidMinimums } from '../duel/tierRanges';
import { settingsLoaded } from './settingsActions';

// Settings -> Duels (backend SettingsDto `duels`, the account's row): where
// the duel engine draws the tier borders - `tierBorders` 'learned' (from
// where you put songs) or 'custom' (`tierMinimums`, each ranked tier's
// lowest shown score but the bottom tier's; kept under 'learned' so
// switching back restores them). Persisted like appearance/naming.
const DEFAULT = { tierBorders: BORDER_MODES.learned, tierMinimums: null };

function resolve(saved) {
  const tierMinimums = saved?.tierMinimums && isValidMinimums(saved.tierMinimums) ? { ...saved.tierMinimums } : null;
  const custom = saved?.tierBorders === BORDER_MODES.custom && tierMinimums;
  return { tierBorders: custom ? BORDER_MODES.custom : BORDER_MODES.learned, tierMinimums };
}

const duelSettingsSlice = createSlice({
  name: 'duels',
  initialState: () => resolve(getSetting(SETTINGS.duels, DEFAULT)),
  reducers: {
    // Back to learned borders; the user's ranges stay for next time.
    setLearnedBorders: (state) => {
      state.tierBorders = BORDER_MODES.learned;
    },
    // payload: { S, A, B, C } - valid (tierRanges.validateMinimums), else ignored.
    setOwnRanges: (state, action) => {
      if (!isValidMinimums(action.payload)) return;
      state.tierBorders = BORDER_MODES.custom;
      state.tierMinimums = { ...action.payload };
    },
  },
  extraReducers: (builder) => {
    builder.addCase(settingsLoaded, (state, action) => (action.payload.duels ? resolve(action.payload.duels) : state));
  },
});

export const selectDuelSettings = (state) => state.duels;

export const { setLearnedBorders, setOwnRanges } = duelSettingsSlice.actions;
export default duelSettingsSlice.reducer;
