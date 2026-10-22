import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Button, Group, NumberInput, Paper, Radio, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Check } from 'lucide-react';
import { useTierName } from '../tierLabels';
import { TIER_ORDER } from '../tiers';
import { TierChip } from './TierBits';
import { useDuelAnalysisQuery } from '../api/queries';
import { selectDuelLayout } from '../store/selectors';
import { selectDuelSettings, setLearnedBorders, setOwnRanges } from '../store/duelSettingsSlice';
import {
  BORDER_MODES, BOTTOM_TIER, DEFAULT_MINIMUMS, MAX_SCORE, MIN_SCORE, TIERS_WITH_MINIMUM,
  isValidMinimums, minimumsFromBorders, previewCounts, rangeText, tierRanges, validateMinimums,
} from '../duel/tierRanges';

const MODES = [
  {
    value: BORDER_MODES.learned,
    label: 'Learned from my tiers',
    text: 'The borders follow where you already put songs. A move is suggested when the duels say a song sits on the other side of one.',
  },
  {
    value: BORDER_MODES.custom,
    label: 'My own ranges',
    text: 'You set the score each tier starts at. Moves, borderline duels and certainty all follow your ranges.',
  },
];

const same = (a, b) => !!a && !!b && TIERS_WITH_MINIMUM.every((t) => Number(a[t]) === Number(b[t]));

// Settings -> Duels: where the duel engine draws the line between tiers. The
// engine (backend) does the rest; this form only edits the account setting
// (duelSettingsSlice, synced by useSettingsSync) and previews the ranges
// against the board you have open.
export default function DuelSettings() {
  const dispatch = useDispatch();
  const tierName = useTierName();
  const saved = useSelector(selectDuelSettings);
  // "My own ranges" picked but not saved yet: the form shows, nothing changes.
  const [pickedCustom, setPickedCustom] = useState(false);
  const choice = saved.tierBorders === BORDER_MODES.custom || pickedCustom ? BORDER_MODES.custom : BORDER_MODES.learned;

  // Preview: the board that's open (if any) - its analysis' scores.
  const board = useSelector((s) => s.tiers.loadedCategory);
  const duelLayout = useSelector(selectDuelLayout);
  const hasRanked = TIER_ORDER.some((t) => duelLayout.layout.tiers[t]?.length);
  const { data: analysis } = useDuelAnalysisQuery(board, duelLayout, !!board && hasRanked);

  const { control, handleSubmit, reset, formState } = useForm({
    mode: 'onChange',
    defaultValues: saved.tierMinimums ?? DEFAULT_MINIMUMS,
    resolver: (values) => {
      const errors = validateMinimums(values, tierName);
      return Object.keys(errors).length
        ? { values: {}, errors: Object.fromEntries(Object.entries(errors).map(([t, message]) => [t, { type: 'validate', message }])) }
        : { values, errors: {} };
    },
  });
  // No ranges of your own yet: start from the borders learned on the open board.
  useEffect(() => {
    if (!saved.tierMinimums && analysis?.borders && !formState.isDirty) reset(minimumsFromBorders(analysis.borders));
  }, [analysis, saved.tierMinimums, formState.isDirty, reset]);

  const values = useWatch({ control });
  const valid = isValidMinimums(values);
  const ranges = valid ? tierRanges(values) : null;
  const counts = valid && analysis ? previewCounts(analysis.songs, values) : null;
  const inUse = saved.tierBorders === BORDER_MODES.custom && same(values, saved.tierMinimums);

  function pick(mode) {
    setPickedCustom(mode === BORDER_MODES.custom);
    if (mode === BORDER_MODES.learned && saved.tierBorders !== BORDER_MODES.learned) {
      dispatch(setLearnedBorders());
      notifications.show({ message: 'Duels use the borders learned from your tiers again' });
    }
  }

  const save = handleSubmit((v) => {
    const minimums = Object.fromEntries(TIERS_WITH_MINIMUM.map((t) => [t, Number(v[t])]));
    dispatch(setOwnRanges(minimums));
    reset(minimums);
    notifications.show({ message: 'Saved - duels now use your own tier ranges' });
  });

  return (
    <Stack gap="lg">
      <div>
        <Title order={2} mb="3xs">
          Tier borders
        </Title>
        <Text c="dimmed" fz="sm" mb="sm">
          Where a duel draws the line between tiers, on the score the duel pages show - a song new to duels starts around 250, and
          neighbouring tiers sit about 60 apart. Saved to your account, for every board.
        </Text>
        <Radio.Group value={choice} onChange={pick} aria-label="Tier borders">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            {MODES.map((m) => (
              <Radio.Card key={m.value} value={m.value} radius="md" p="sm">
                <Group gap="xs" wrap="nowrap" align="flex-start">
                  <Radio.Indicator size="xs" mt="5xs" />
                  <div>
                    <Text fw={600} fz="md">{m.label}</Text>
                    <Text c="dimmed" fz="sm">{m.text}</Text>
                  </div>
                </Group>
              </Radio.Card>
            ))}
          </SimpleGrid>
        </Radio.Group>
      </div>

      {choice === BORDER_MODES.custom && (
        <Stack gap="sm">
          <Paper withBorder radius="md" p="sm">
            <Table verticalSpacing="2xs" horizontalSpacing="sm" aria-label="Your tier ranges">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Tier</Table.Th>
                  <Table.Th>Starts at</Table.Th>
                  <Table.Th>Range</Table.Th>
                  {counts && <Table.Th>On {board}</Table.Th>}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {TIER_ORDER.map((tier, i) => (
                  <Table.Tr key={tier}>
                    <Table.Td>
                      <TierChip tier={tier} size={24} />
                    </Table.Td>
                    <Table.Td>
                      {tier === BOTTOM_TIER ? (
                        <Text fz="sm" c="dimmed">everything lower</Text>
                      ) : (
                        <Controller
                          name={tier}
                          control={control}
                          render={({ field, fieldState }) => (
                            <NumberInput
                              {...field}
                              aria-label={`Lowest score for ${tierName(tier)}`}
                              allowDecimal={false}
                              allowNegative={false}
                              min={MIN_SCORE}
                              max={MAX_SCORE}
                              clampBehavior="none"
                              w={140}
                              error={fieldState.error?.message}
                            />
                          )}
                        />
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm" ff="monospace" data-testid={`range-${tier}`}>
                        {ranges ? rangeText(ranges[i]) : '-'}
                      </Text>
                    </Table.Td>
                    {counts && (
                      <Table.Td>
                        <Text fz="sm" c="dimmed" data-testid={`count-${tier}`}>
                          {counts[tier]} {counts[tier] === 1 ? 'song' : 'songs'}
                        </Text>
                      </Table.Td>
                    )}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {counts && (
              <Text fz="xs" c="dimmed" mt="2xs">
                How the songs on {board} would fall by score today. Duels still move them, and nothing changes tier until you accept a move.
              </Text>
            )}
          </Paper>

          <Group gap="sm">
            <Text fz="xs" c="dimmed" mr="auto">
              {inUse ? 'In use' : 'Not in use until you save'}
            </Text>
            <Button variant="subtle" color="gray" onClick={() => reset(saved.tierMinimums ?? DEFAULT_MINIMUMS)} disabled={!formState.isDirty}>
              Reset
            </Button>
            <Button leftSection={<Check size={15} />} onClick={save} disabled={!valid || inUse}>
              Save
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
