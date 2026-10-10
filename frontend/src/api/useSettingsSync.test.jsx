import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// The server side is mocked at the hook boundary (api/queries.js); the
// Redux slices, mapping and merge are real.
const query = { data: undefined, isSuccess: false, isError: false, refetch: vi.fn() };
const mutateAsync = vi.fn();
vi.mock('./queries', () => ({
  useSettingsQuery: () => query,
  useSaveSettingsMutation: () => ({ mutateAsync }),
}));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

import { notifications } from '@mantine/notifications';
import { useSettingsSync } from './useSettingsSync';
import { toServer } from './settingsMapping';
import appearanceReducer, { setActivityOrder, setTheme } from '../store/appearanceSlice';
import { DEFAULT_ACTIVITY_ORDER } from '../activityOrder';
import namingReducer from '../store/namingSlice';

const makeStore = () => configureStore({ reducer: { appearance: appearanceReducer, naming: namingReducer } });

function mount(store) {
  const wrapper = ({ children }) => <Provider store={store}>{children}</Provider>;
  return renderHook(() => useSettingsSync(true), { wrapper });
}

const settle = () => act(() => vi.advanceTimersByTimeAsync(600));

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(query, { data: undefined, isSuccess: false, isError: false });
  query.refetch.mockReset();
  mutateAsync.mockReset();
  notifications.show.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('useSettingsSync', () => {
  it('not ready while loading; ready once loaded or failed', () => {
    const store = makeStore();
    const { result, rerender } = mount(store);
    expect(result.current.ready).toBe(false);
    query.isError = true;
    rerender();
    expect(result.current.ready).toBe(true);
  });

  it('adopts the account’s row and does not re-save an identical copy', async () => {
    const store = makeStore();
    const mine = ['addSongs', 'home', 'jump', 'boards', 'playlists'];
    const row = { ...toServer(store.getState()), appearance: { theme: 'dracula', accent: 'violet', tierPalette: 'heat', activityOrder: mine } };
    Object.assign(query, { data: { settings: row, etag: '"3"' }, isSuccess: true });
    mount(store);
    await settle();
    expect(store.getState().appearance).toEqual({ theme: 'dracula', accent: 'violet', tierPalette: 'heat', activityOrder: mine });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('an account with no row gets this browser’s settings uploaded (no etag)', async () => {
    const store = makeStore();
    Object.assign(query, { data: { settings: null, etag: null }, isSuccess: true });
    mutateAsync.mockImplementation(async ({ settings }) => ({ settings, etag: '"0"' }));
    mount(store);
    await settle();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0]).toEqual({ settings: toServer(store.getState()), etag: null });
  });

  it('a local edit is saved against the last seen etag', async () => {
    const store = makeStore();
    Object.assign(query, { data: { settings: toServer(store.getState()), etag: '"1"' }, isSuccess: true });
    mutateAsync.mockImplementation(async ({ settings }) => ({ settings, etag: '"2"' }));
    mount(store);
    await settle();
    act(() => {
      store.dispatch(setTheme('paper'));
    });
    await settle();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0].etag).toBe('"1"');
    expect(mutateAsync.mock.calls[0][0].settings.appearance.theme).toBe('paper');
  });

  it('on 412 refetches, rebases this browser’s edit on the newer row and saves again', async () => {
    const store = makeStore();
    const base = toServer(store.getState());
    Object.assign(query, { data: { settings: base, etag: '"1"' }, isSuccess: true });
    const newer = { ...base, appearance: { ...base.appearance, tierPalette: 'heat' } };
    query.refetch.mockResolvedValue({ data: { settings: newer, etag: '"2"' } });
    mutateAsync
      .mockRejectedValueOnce({ response: { status: 412 } })
      .mockImplementation(async ({ settings }) => ({ settings, etag: '"3"' }));
    mount(store);
    await settle();
    act(() => {
      store.dispatch(setTheme('sand'));
    });
    await settle();
    await settle();
    // Both changes survive: ours (theme) and the other device's (tier palette).
    expect(store.getState().appearance.theme).toBe('sand');
    expect(store.getState().appearance.tierPalette).toBe('heat');
    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutateAsync.mock.calls[1][0].etag).toBe('"2"');
    expect(mutateAsync.mock.calls[1][0].settings.appearance.theme).toBe('sand');
    expect(mutateAsync.mock.calls[1][0].settings.appearance.tierPalette).toBe('heat');
  });

  it('a reordered activity bar is saved, and survives a 412 rebase next to the other device’s change', async () => {
    const store = makeStore();
    const base = toServer(store.getState());
    expect(base.appearance.activityOrder).toEqual(DEFAULT_ACTIVITY_ORDER);
    Object.assign(query, { data: { settings: base, etag: '"1"' }, isSuccess: true });
    const newer = { ...base, appearance: { ...base.appearance, theme: 'sand' } };
    query.refetch.mockResolvedValue({ data: { settings: newer, etag: '"2"' } });
    mutateAsync
      .mockRejectedValueOnce({ response: { status: 412 } })
      .mockImplementation(async ({ settings }) => ({ settings, etag: '"3"' }));
    mount(store);
    await settle();
    const mine = ['playlists', 'boards', 'home', 'jump', 'addSongs'];
    act(() => {
      store.dispatch(setActivityOrder(mine));
    });
    await settle();
    await settle();
    expect(mutateAsync.mock.calls[0][0].settings.appearance.activityOrder).toEqual(mine);
    expect(store.getState().appearance.activityOrder).toEqual(mine);
    expect(store.getState().appearance.theme).toBe('sand');
    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutateAsync.mock.calls[1][0].settings.appearance).toMatchObject({ theme: 'sand', activityOrder: mine });
  });

  it('a non-412 failure shows a notice and keeps settings locally', async () => {
    const store = makeStore();
    Object.assign(query, { data: { settings: toServer(store.getState()), etag: '"1"' }, isSuccess: true });
    mutateAsync.mockRejectedValue({ response: { status: 500 } });
    mount(store);
    await settle();
    act(() => {
      store.dispatch(setTheme('paper'));
    });
    await settle();
    expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ id: 'settings-save-failed' }));
    expect(query.refetch).not.toHaveBeenCalled();
    expect(store.getState().appearance.theme).toBe('paper');
  });

  it('never saves before the account’s row has loaded', async () => {
    const store = makeStore();
    mount(store);
    act(() => {
      store.dispatch(setTheme('paper'));
    });
    await settle();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
