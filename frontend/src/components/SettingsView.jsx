import { useDispatch, useSelector } from 'react-redux';
import { Box, Group, Radio, Stack, Tabs, Text, Title } from '@mantine/core';
import { ShortcutsList } from './ShortcutsModal';
import AppearanceSettings from './AppearanceSettings';
import PlaylistNamingSettings from './PlaylistNamingSettings';
import { useSearchParams } from 'react-router-dom';
import { DUEL_STRATEGIES, DUEL_STRATEGY_LABELS } from '../duel';
import { setDuelStrategy } from '../store/prefsSlice';

const CATEGORIES = [
  { key: 'appearance', label: 'Appearance' },
  { key: 'naming', label: 'Playlist naming' },
  { key: 'duels', label: 'Duels' },
  { key: 'keyboard', label: 'Keyboard shortcuts' },
];

const STRATEGY_DESCRIPTIONS = {
  tierAwareMerge:
    "Trusts your current tier placement and only settles disagreements between tiers. Far fewer duels for a real library.",
  mergeSort:
    "Ignores current tiers and re-derives a full ranking from scratch. More duels, but doesn't assume your existing tiers are correct.",
  elo: "Chess-style rating over random pairs. Tolerates skipping a duel you're unsure about, at the cost of an approximate rather than exact order.",
};

export default function SettingsView() {
  // ?tab=naming etc. deep-links to a tab (and the tab you're on stays in the URL).
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = CATEGORIES.some((c) => c.key === searchParams.get('tab')) ? searchParams.get('tab') : 'appearance';
  const dispatch = useDispatch();
  const duelStrategy = useSelector((s) => s.prefs.duelStrategy);

  function chooseStrategy(key) {
    dispatch(setDuelStrategy(key));
  }

  return (
    <Box component="section">
      <Title order={1} fz={{ base: 26, sm: 30 }} fw={900} mb="md">
        Settings
      </Title>

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

        <Tabs.Panel value="duels" pl="xl" maw={680}>
          <div>
            <Title order={2} fz={18} mb={6}>
              Duel ranking algorithm
            </Title>
            <Text c="dimmed" fz="sm" mb="lg">
              Used as the default whenever you start a new duel session. You can still switch
              strategies for a single session from the duel screen itself.
            </Text>

            <Radio.Group value={duelStrategy} onChange={chooseStrategy}>
              <Stack gap="sm">
                {Object.keys(DUEL_STRATEGIES).map((key) => (
                  <Radio.Card key={key} value={key} radius="md" p="md">
                    <Group wrap="nowrap" align="flex-start" gap="md">
                      <Radio.Indicator mt={2} />
                      <div>
                        <Text fw={600} size="sm">
                          {DUEL_STRATEGY_LABELS[key]}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {STRATEGY_DESCRIPTIONS[key]}
                        </Text>
                      </div>
                    </Group>
                  </Radio.Card>
                ))}
              </Stack>
            </Radio.Group>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="keyboard" pl="xl" maw={680}>
          <ShortcutsList />
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
