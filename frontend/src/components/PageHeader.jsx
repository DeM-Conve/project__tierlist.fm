import { Box, Group, Stack, Text, Title } from '@mantine/core';
import { useInRouterContext } from 'react-router-dom';
import UpCrumb from './UpCrumb';

// The one page header every page uses, so titles, meta lines and actions sit
// in the same place page to page:
//   [eyebrow | crumb]              (same slot, same height)
//   [badge] title                  [actions, top-aligned with the title]
//           meta
// The top slot is the page's "← parent  g u" crumb (UpCrumb, upLevel.js)
// on every page that has a parent; `eyebrow` only shows on one that doesn't
// (Home). `crumb` overrides both.
// `title` is a string (rendered as the h1) or a node that renders its own
// h1 (e.g. the board's rename-in-place editor). Spacing is fixed here -
// pages only put SECTION_GAP (layout/spacing.js) under it.
export default function PageHeader({ eyebrow, crumb, badge, title, meta, actions, align = 'left' }) {
  const centered = align === 'center';
  const inRouter = useInRouterContext();
  return (
    <Stack gap="4xs" align={centered ? 'center' : undefined} ta={centered ? 'center' : undefined}>
      <Box mih={18} style={{ display: 'flex', alignItems: 'center' }}>
        {crumb ??
          (inRouter ? <UpCrumb fallback={eyebrow && <Eyebrow>{eyebrow}</Eyebrow>} /> : eyebrow && <Eyebrow>{eyebrow}</Eyebrow>)}
      </Box>
      <Group justify={centered ? 'center' : 'space-between'} align="flex-start" wrap="wrap" gap="md" w={centered ? undefined : '100%'}>
        <Group gap="sm" wrap="nowrap" align="center" miw={0}>
          {badge}
          <Stack gap="5xs" miw={0}>
            {typeof title === 'string' ? (
              <Title order={1} lh={1.15}>
                {title}
              </Title>
            ) : (
              title
            )}
            {meta && (
              <Text c="dimmed" fz="sm">
                {meta}
              </Text>
            )}
          </Stack>
        </Group>
        {actions && (
          <Group gap="xs" wrap="wrap">
            {actions}
          </Group>
        )}
      </Group>
    </Stack>
  );
}

function Eyebrow({ children }) {
  return (
    <Text fz="xs" fw={800} tt="uppercase" c="accent" style={{ letterSpacing: 1.5 }}>
      {children}
    </Text>
  );
}
