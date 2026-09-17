import { useState } from 'react';
import { Group, Radio, Stack, Tabs, Text } from '@mantine/core';
import { DUEL_STRATEGIES, DUEL_STRATEGY_LABELS, DEFAULT_DUEL_STRATEGY } from '../duel';
import { SETTINGS, getSetting, setSetting } from '../settings';

const CATEGORIES = [{ key: 'duels', label: 'Duels' }];

const STRATEGY_DESCRIPTIONS = {
  tierAwareMerge:
    "Trusts your current tier placement and only settles disagreements between tiers. Far fewer duels for a real library.",
  mergeSort:
    "Ignores current tiers and re-derives a full ranking from scratch. More duels, but doesn't assume your existing tiers are correct.",
  elo: "Chess-style rating over random pairs. Tolerates skipping a duel you're unsure about, at the cost of an approximate rather than exact order.",
};

export default function SettingsView() {
  const [duelStrategy, setDuelStrategy] = useState(() =>
    getSetting(SETTINGS.duelStrategy, DEFAULT_DUEL_STRATEGY)
  );

  function chooseStrategy(key) {
    setDuelStrategy(key);
    setSetting(SETTINGS.duelStrategy, key);
  }

  return (
    <section className="settings-view">
      <div className="canvas-header">
        <h1>Settings</h1>
      </div>

      <Tabs defaultValue="duels" orientation="vertical" className="settings-layout">
        <Tabs.List>
          {CATEGORIES.map((c) => (
            <Tabs.Tab key={c.key} value={c.key}>
              {c.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel value="duels" className="settings-content">
          <div className="settings-section">
            <h2>Duel ranking algorithm</h2>
            <p className="hint-text">
              Used as the default whenever you start a new duel session. You can still switch
              strategies for a single session from the duel screen itself.
            </p>

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
      </Tabs>
    </section>
  );
}
