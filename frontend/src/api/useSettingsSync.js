import { useEffect, useRef } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { useDebouncedCallback } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { settingsLoaded } from '../store/settingsActions';
import { useSaveSettingsMutation, useSettingsQuery } from './queries';
import { rebase, sameSettings, toServer } from './settingsMapping';

// Keeps the user's settings in Postgres (per Google account), so they follow
// the account across browsers. On login the account's row is loaded and wins
// over this browser's localStorage cache; an account with no row yet gets
// this browser's settings uploaded (If-None-Match: *). After that every change
// is saved (debounced, one request in flight at a time) against the version
// last seen (If-Match). If another device saved in between (412), the newer
// row is fetched, this browser's own edits are merged on top (rebase) and
// saved again - nobody's change is silently lost.
// Returns `ready` once the account's settings are applied (or failed to
// load), so first-run template detection doesn't run for an account that
// already chose a template.
export function useSettingsSync(enabled) {
  const dispatch = useDispatch();
  const store = useStore();
  const { data, isSuccess, isError, refetch } = useSettingsQuery(enabled);
  const { mutateAsync } = useSaveSettingsMutation();
  // Last server state seen: { settings, etag }; undefined until loaded.
  const server = useRef(undefined);
  const saving = useRef(false);
  // The flush below re-schedules itself (edits made while a save was in
  // flight, or a merge after 412); a ref avoids it capturing itself.
  const flushRef = useRef(() => {});

  const flush = useDebouncedCallback(
    async () => {
      const base = server.current;
      if (base === undefined || saving.current) return;
      const local = toServer(store.getState());
      if (sameSettings(local, base.settings)) return;

      saving.current = true;
      let retry = false;
      try {
        server.current = await mutateAsync({ settings: local, etag: base.etag });
        retry = true; // edits made while this save was in flight
      } catch (error) {
        const fresh = error.response?.status === 412 ? (await refetch()).data : undefined;
        if (fresh) {
          server.current = fresh;
          dispatch(settingsLoaded(rebase(local, base.settings, fresh.settings)));
          retry = true;
        } else {
          notifications.show({
            id: 'settings-save-failed',
            color: 'red',
            message: "Couldn't save your settings to your account - they're kept on this browser for now",
          });
        }
      } finally {
        saving.current = false;
      }
      if (retry) flushRef.current();
    },
    { delay: 500, flushOnUnmount: true }
  );

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    if (!isSuccess || server.current !== undefined) return;
    server.current = data;
    if (data.settings) dispatch(settingsLoaded(data.settings));
    flush(); // no row yet (or a slice normalised a value) -> upload
  }, [isSuccess, data, dispatch, flush]);

  const appearance = useSelector((s) => s.appearance);
  const naming = useSelector((s) => s.naming);
  const prefs = useSelector((s) => s.prefs);
  useEffect(() => {
    flush();
  }, [appearance, naming, prefs, flush]);

  return { ready: isSuccess || isError };
}
