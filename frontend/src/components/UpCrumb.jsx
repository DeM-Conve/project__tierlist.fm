import { Group, Kbd, Text, UnstyledButton } from '@mantine/core';
import { ArrowLeft } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { parentOf } from '../upLevel';

// "← <parent>  g u": the crumb every page with a parent shows (PageHeader's
// crumb slot, the duel matchup's top bar). Its target is upLevel.js's - the
// same place `g u` goes - so the link and the key never disagree.
// `fallback` shows on a page with no parent (Home's eyebrow).
export default function UpCrumb({ fallback = null }) {
  const up = parentOf(useLocation().pathname);
  if (!up) return fallback;
  return (
    <UnstyledButton component={Link} to={up.to} aria-keyshortcuts="g u" miw={0}>
      <Group gap="3xs" c="dimmed" wrap="nowrap">
        <ArrowLeft size={14} />
        <Text fz="xs" truncate>{up.label}</Text>
        <Kbd size="xs">g u</Kbd>
      </Group>
    </UnstyledButton>
  );
}
