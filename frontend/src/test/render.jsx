import { configureStore } from '@reduxjs/toolkit';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import authReducer from '../store/authSlice';
import viewReducer from '../store/viewSlice';
import tiersReducer from '../store/tiersSlice';
import focusReducer from '../store/focusSlice';
import appearanceReducer from '../store/appearanceSlice';
import namingReducer from '../store/namingSlice';
import prefsReducer from '../store/prefsSlice';
import addSongsReducer from '../store/addSongsSlice';

const reducer = {
  auth: authReducer,
  view: viewReducer,
  tiers: tiersReducer,
  focus: focusReducer,
  appearance: appearanceReducer,
  naming: namingReducer,
  prefs: prefsReducer,
  addSongs: addSongsReducer,
};

// A real store (the app's reducers) with `playlists` loaded and `naming`
// merged over the default naming state.
export function makeStore({ playlists = [], naming = {} } = {}) {
  const init = namingReducer(undefined, { type: '@@test/init' });
  return configureStore({
    reducer,
    preloadedState: {
      auth: { ...authReducer(undefined, { type: '@@test/init' }), loggedIn: true, playlists },
      naming: { ...init, ...naming },
    },
  });
}

// Renders `ui` inside the app's providers.
export function renderWithApp(ui, { store = makeStore(), queryClient = new QueryClient() } = {}) {
  return {
    store,
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <Provider store={store}>
          <MantineProvider>{ui}</MantineProvider>
        </Provider>
      </QueryClientProvider>
    ),
  };
}
