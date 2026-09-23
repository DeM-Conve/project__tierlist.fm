import { createAction } from '@reduxjs/toolkit';

// The account's saved settings arrived from the backend (Postgres) -
// payload is `{ appearance, naming, prefs }` (useSettingsSync maps the
// server's columns into slice shapes). Each persisted slice adopts its own
// section, so the account's copy wins over this browser's localStorage cache.
export const settingsLoaded = createAction('settings/loaded');
