import { useDispatch, useSelector } from 'react-redux';
import { Badge, Box, CheckIcon, ColorSwatch, Group, Radio, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { ACCENTS, THEMES, TIER_PALETTES } from '../themes';
import { TIER_ORDER } from '../tiers';
import { setAccent, setTheme, setTierPalette } from '../store/appearanceSlice';

// Previews are drawn from each option's own definition in themes.js (not the
// live CSS variables), so every card shows what picking it would look like.
function ThemePreview({ theme, accent, tierColors }) {
  const fill = accent.scale[theme.scheme === 'dark' ? accent.onDark : accent.onLight];
  return (
    <Box h={92} bg={theme.bg} style={{ borderRadius: 6, border: `1px solid ${theme.border}`, display: 'flex', overflow: 'hidden' }}>
      <Box w={34} bg={theme.surface} style={{ borderRight: `1px solid ${theme.borderSoft}` }} p={6}>
        <Stack gap={4}>
          {[0, 1, 2].map((i) => (
            <Box key={i} h={4} bg={i === 0 ? fill : theme.textFaint} style={{ borderRadius: 2 }} />
          ))}
        </Stack>
      </Box>
      <Stack gap={5} p={8} style={{ flex: 1 }}>
        <Group justify="space-between" wrap="nowrap">
          <Box h={6} w={46} bg={theme.text} style={{ borderRadius: 2 }} />
          <Box h={12} w={30} bg={fill} style={{ borderRadius: 3 }} />
        </Group>
        {TIER_ORDER.slice(0, 4).map((t) => (
          <Group key={t} gap={3} wrap="nowrap">
            <Box w={10} h={9} bg={tierColors[t]} style={{ borderRadius: 2 }} />
            <Box h={9} style={{ flex: 1, borderRadius: 2 }} bg={theme.surface2} />
          </Group>
        ))}
      </Stack>
    </Box>
  );
}

export default function AppearanceSettings() {
  const dispatch = useDispatch();
  const appearance = useSelector((s) => s.appearance);
  const accent = ACCENTS[appearance.accent];
  const tierColors = TIER_PALETTES[appearance.tierPalette].colors;

  return (
    <Stack gap={36}>
      <div>
        <Title order={2} fz={18} mb={6}>
          Theme
        </Title>
        <Text c="dimmed" fz="sm" mb="md">
          Backgrounds, surfaces and text - picking one also applies its signature accent. Changes apply instantly and are saved to your account.
        </Text>
        <Radio.Group
          value={appearance.theme}
          onChange={(v) => {
            dispatch(setTheme(v));
            // Each theme comes with its signature accent; still changeable below.
            if (THEMES[v].accent) dispatch(setAccent(THEMES[v].accent));
          }}
        >
          <SimpleGrid cols={{ base: 1, xs: 2, lg: 3 }} spacing="sm">
            {Object.entries(THEMES).map(([key, theme]) => (
              <Radio.Card key={key} value={key} radius="md" p="sm">
                <ThemePreview theme={theme} accent={accent} tierColors={tierColors} />
                <Group justify="space-between" mt="sm" wrap="nowrap">
                  <Group gap={8} wrap="nowrap">
                    <Radio.Indicator size="xs" />
                    <Text fw={600} fz="sm">
                      {theme.label}
                    </Text>
                  </Group>
                  <Badge size="xs" variant="light" color="gray">
                    {theme.scheme}
                  </Badge>
                </Group>
              </Radio.Card>
            ))}
          </SimpleGrid>
        </Radio.Group>
      </div>

      <div>
        <Title order={2} fz={18} mb={6}>
          Accent
        </Title>
        <Text c="dimmed" fz="sm" mb="md">
          Buttons, selection and focus rings. Works with any theme.
        </Text>
        <Radio.Group value={appearance.accent} onChange={(v) => dispatch(setAccent(v))}>
          <Group gap="sm">
            {Object.entries(ACCENTS).map(([key, a]) => (
              <Radio.Card key={key} value={key} radius="md" p="xs" w="auto">
                <Group gap={8} wrap="nowrap" pr={6}>
                  <ColorSwatch color={a.scale[5]} size={24}>
                    {appearance.accent === key && <CheckIcon size={11} color={a.scale[9]} />}
                  </ColorSwatch>
                  <Text fz="sm" fw={600}>
                    {a.label}
                  </Text>
                </Group>
              </Radio.Card>
            ))}
          </Group>
        </Radio.Group>
      </div>

      <div>
        <Title order={2} fz={18} mb={6}>
          Tier colors
        </Title>
        <Text c="dimmed" fz="sm" mb="md">
          Used everywhere a tier appears - board rows, rail, chips, the player and the share image.
        </Text>
        <Radio.Group value={appearance.tierPalette} onChange={(v) => dispatch(setTierPalette(v))}>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            {Object.entries(TIER_PALETTES).map(([key, p]) => (
              <Radio.Card key={key} value={key} radius="md" p="sm">
                <Group gap={4} wrap="nowrap" mb="sm">
                  {TIER_ORDER.map((t) => (
                    <Box key={t} h={28} bg={p.colors[t]} style={{ flex: 1, borderRadius: 4, display: 'grid', placeItems: 'center' }}>
                      <Text ff="var(--font-display)" fw={900} fz={11} c="var(--tier-ink)">
                        {t}
                      </Text>
                    </Box>
                  ))}
                </Group>
                <Group gap={8}>
                  <Radio.Indicator size="xs" />
                  <Text fw={600} fz="sm">
                    {p.label}
                  </Text>
                </Group>
              </Radio.Card>
            ))}
          </SimpleGrid>
        </Radio.Group>
      </div>
    </Stack>
  );
}
