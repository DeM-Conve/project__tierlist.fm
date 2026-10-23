import { Box, Tabs } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { ShortcutsList } from './ShortcutsModal';
import AppearanceSettings from './AppearanceSettings';
import PlaylistNamingSettings from './PlaylistNamingSettings';
import DuelSettings from './DuelSettings';
import { useSearchParams } from 'react-router-dom';
import PageHeader from './PageHeader';
import { SECTION_GAP } from '../layout/spacing';

const CATEGORIES = [
  { key: 'appearance', label: 'Appearance' },
  { key: 'naming', label: 'Playlist naming' },
  { key: 'duels', label: 'Duels' },
  { key: 'keyboard', label: 'Keyboard shortcuts' },
];

export default function SettingsView() {
  // ?tab=naming etc. deep-links to a tab (and the tab you're on stays in the URL).
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = CATEGORIES.some((c) => c.key === searchParams.get('tab')) ? searchParams.get('tab') : 'appearance';
  // On a phone the side nav would leave the open section a sliver (and its
  // fixed-width fields scrolled the page sideways): tabs go across the top.
  const narrow = useMediaQuery('(max-width: 47.99em)');
  const panel = narrow ? { pt: 'md' } : { pl: 'xl' };

  return (
    <Box component="section">
      <Box mb={SECTION_GAP}>
        <PageHeader title="Settings" meta="Look, playlist naming, duels and shortcuts - saved to your account." />
      </Box>

      <Tabs value={tab} onChange={(v) => v && setSearchParams({ tab: v }, { replace: true })} orientation={narrow ? 'horizontal' : 'vertical'}>
        {/* Only as tall as its tabs (not the open section), and it stays put while a long section scrolls. */}
        <Tabs.List style={narrow ? undefined : { alignSelf: 'flex-start', position: 'sticky', top: 'var(--mantine-spacing-md)' }}>
          {CATEGORIES.map((c) => (
            <Tabs.Tab key={c.key} value={c.key}>
              {c.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel value="appearance" {...panel} maw={980}>
          <AppearanceSettings />
        </Tabs.Panel>

        <Tabs.Panel value="naming" {...panel} maw={980}>
          <PlaylistNamingSettings />
        </Tabs.Panel>

        <Tabs.Panel value="duels" {...panel} maw={980}>
          <DuelSettings />
        </Tabs.Panel>

        <Tabs.Panel value="keyboard" {...panel} maw={680}>
          <ShortcutsList />
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
