import { createAction } from '@reduxjs/toolkit';

// The account's saved settings arrived from the backend (Postgres) -
// payload is `{ appearance, naming, prefs }` - the backend SettingsDto,
// already grouped like the slices (api/settingsMapping.js). Each slice adopts its own
// section, so the account's copy wins over this browser's localStorage cache.
export const settingsLoaded = createAction('settings/loaded');
