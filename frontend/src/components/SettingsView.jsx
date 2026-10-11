import { Box, Tabs } from '@mantine/core';
import { ShortcutsList } from './ShortcutsModal';
import AppearanceSettings from './AppearanceSettings';
import PlaylistNamingSettings from './PlaylistNamingSettings';
import { useSearchParams } from 'react-router-dom';
import PageHeader from './PageHeader';
import { SECTION_GAP } from '../layout/spacing';

const CATEGORIES = [
  { key: 'appearance', label: 'Appearance' },
  { key: 'naming', label: 'Playlist naming' },
  { key: 'keyboard', label: 'Keyboard shortcuts' },
];

export default function SettingsView() {
  // ?tab=naming etc. deep-links to a tab (and the tab you're on stays in the URL).
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = CATEGORIES.some((c) => c.key === searchParams.get('tab')) ? searchParams.get('tab') : 'appearance';

  return (
    <Box component="section">
      <Box mb={SECTION_GAP}>
        <PageHeader eyebrow="Account" title="Settings" meta="Look, playlist naming and shortcuts - saved to your account." />
      </Box>

      <Tabs value={tab} onChange={(v) => v && setSearchParams({ tab: v }, { replace: true })} orientation="vertical">
        {/* Only as tall as its tabs (not the open section), and it stays put while a long section scrolls. */}
        <Tabs.List style={{ alignSelf: 'flex-start', position: 'sticky', top: 16 }}>
          {CATEGORIES.map((c) => (
            <Tabs.Tab key={c.key} value={c.key}>
              {c.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel value="appearance" pl="xl" maw={980}>
          <AppearanceSettings />
        </Tabs.Panel>

        <Tabs.Panel value="naming" pl="xl" maw={980}>
          <PlaylistNamingSettings />
        </Tabs.Panel>

        <Tabs.Panel value="keyboard" pl="xl" maw={680}>
          <ShortcutsList />
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
