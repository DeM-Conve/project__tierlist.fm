import { createSlice } from '@reduxjs/toolkit';

// Videos for the single playlist currently open in the plain "items" view
// (as opposed to a tier board, which lives in tiersSlice).
const itemsSlice = createSlice({
  name: 'items',
  initialState: {
    items: null,
    loadingItems: false,
  },
  reducers: {
    setItems: (state, action) => {
      state.items = action.payload;
    },
    setLoadingItems: (state, action) => {
      state.loadingItems = action.payload;
    },
  },
});

export const { setItems, setLoadingItems } = itemsSlice.actions;
export default itemsSlice.reducer;
