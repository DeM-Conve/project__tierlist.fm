import { useEffect, useRef } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { useDebouncedCallback } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { settingsLoaded } from '../store/settingsActions';
import { useSaveSettingMutation, useSettingsQuery } from './queries';

// Redux -> the server's `user_settings` columns (backend SettingsDto).
function toServer(s) {
  return {
    theme: s.appearance.theme,
    accent: s.appearance.accent,
    tierPalette: s.appearance.tierPalette,
    namingTemplate: s.naming.template,
    namingMigratingFrom: s.naming.migratingFrom,
    duelStrategy: s.prefs.duelStrategy,
  };
}

// The server's columns -> each slice's shape (slices validate on the way in).
function fromServer(row) {
  return {
    appearance: { theme: row.theme, accent: row.accent, tierPalette: row.tierPalette },
    naming: { template: row.namingTemplate, migratingFrom: row.namingMigratingFrom },
    prefs: { duelStrategy: row.duelStrategy },
  };
}

// Keeps the user's settings in Postgres (per Google account), so they follow
// the account across browsers. On login the account's row is loaded and wins
// over this browser's localStorage cache; an account with no row yet gets
// this browser's settings uploaded (that's how existing settings migrate).
// After that, every change is saved (debounced). Returns `ready` once the
// account's settings are applied (or failed to load), so first-run template
// detection doesn't run for an account that already chose a template.
export function useSettingsSync(enabled) {
  const dispatch = useDispatch();
  const store = useStore();
  const { data, isSuccess, isError } = useSettingsQuery(enabled);
  const { mutate } = useSaveSettingMutation();
  // JSON of what the server holds; undefined until the account's row loaded.
  const serverCopy = useRef(undefined);

  const flush = useDebouncedCallback(
    () => {
      if (serverCopy.current === undefined) return;
      const json = JSON.stringify(toServer(store.getState()));
      if (json === serverCopy.current) return;
      const previous = serverCopy.current;
      serverCopy.current = json;
      mutate(JSON.parse(json), {
        onError: () => {
          serverCopy.current = previous; // retried on the next change
          notifications.show({
            id: 'settings-save-failed',
            color: 'red',
            message: "Couldn't save your settings to your account - they're kept on this browser for now",
          });
        },
      });
    },
    { delay: 500, flushOnUnmount: true }
  );

  useEffect(() => {
    if (!isSuccess || serverCopy.current !== undefined) return;
    if (data) dispatch(settingsLoaded(fromServer(data)));
    serverCopy.current = data ? JSON.stringify(data) : null;
    flush(); // no row yet (or slices normalised a value) -> upload
  }, [isSuccess, data, dispatch, flush]);

  const appearance = useSelector((s) => s.appearance);
  const naming = useSelector((s) => s.naming);
  const prefs = useSelector((s) => s.prefs);
  useEffect(() => {
    flush();
  }, [appearance, naming, prefs, flush]);

  return { ready: isSuccess || isError };
}
