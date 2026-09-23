import { useRef, useState } from 'react';
import { Box, Button, Group, Modal, ScrollArea, SegmentedControl, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Copy, Download } from 'lucide-react';
import { toBlob, toPng } from 'html-to-image';
import { TIER_COLORS } from '../tiers';
import { TIER_INK } from '../tierUtils';

const POSTER_WIDTH = 960;
const ART = 72;

// The tier-list "poster" people actually post: title, one row per tier,
// cover art, a quiet credit. Plain <img crossOrigin> (not Mantine Image)
// so html-to-image can inline YouTube's thumbnails (i.ytimg.com sends
// Access-Control-Allow-Origin: *).
function Poster({ category, tiers, tierItems, perTier }) {
  return (
    <Box
      w={POSTER_WIDTH}
      p={36}
      style={{
        background:
          'radial-gradient(700px 300px at 100% 0%, rgba(214,162,76,0.18), transparent 70%), #131110',
        color: '#f3efe8',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <Text fz={13} fw={800} tt="uppercase" c="#d6a24c" style={{ letterSpacing: 3 }}>
        My tier list
      </Text>
      <Text ff="'Archivo', sans-serif" fw={900} fz={54} lh={1} mb={24} style={{ letterSpacing: '-0.02em' }}>
        {category}
      </Text>
      <Stack gap={6}>
        {tiers.map((t) => {
          const items = tierItems[t] || [];
          const shown = items.slice(0, perTier);
          const rest = items.length - shown.length;
          return (
            <Box key={t} style={{ display: 'flex', background: '#1c1915', borderRadius: 8, overflow: 'hidden', minHeight: ART + 12 }}>
              <Box w={84} bg={TIER_COLORS[t]} style={{ display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Text ff="'Archivo', sans-serif" fw={900} fz={30} c={TIER_INK}>
                  {t}
                </Text>
              </Box>
              <Box p={6} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {shown.map((v) => (
                  <img
                    key={v.videoId}
                    src={v.thumbnail}
                    crossOrigin="anonymous"
                    width={ART}
                    height={ART}
                    alt=""
                    style={{ objectFit: 'cover', borderRadius: 5, display: 'block' }}
                  />
                ))}
                {rest > 0 && (
                  <Text fz={18} fw={800} c="#94897a" px={8}>
                    +{rest}
                  </Text>
                )}
                {items.length === 0 && (
                  <Text fz={13} c="#5c5548" px={8}>
                    —
                  </Text>
                )}
              </Box>
            </Box>
          );
        })}
      </Stack>
      <Text fz={12} c="#5c5548" mt={18} ta="right">
        ranked with Playlist Tiers
      </Text>
    </Box>
  );
}

export default function ShareTierListModal({ opened, onClose, category, tiers, tierItems }) {
  const posterRef = useRef(null);
  const [busy, setBusy] = useState(null);
  const [density, setDensity] = useState('10');
  const perTier = Number(density);

  async function download() {
    setBusy('download');
    try {
      const url = await toPng(posterRef.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement('a');
      a.href = url;
      a.download = `${category}-tier-list.png`;
      a.click();
    } catch {
      notifications.show({ color: 'red', message: "Couldn't render the image - try again." });
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    setBusy('copy');
    try {
      const blob = await toBlob(posterRef.current, { pixelRatio: 2, cacheBust: true });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      notifications.show({ message: 'Tier list image copied - paste it anywhere.' });
    } catch {
      notifications.show({ color: 'red', message: "Couldn't copy - your browser may block image clipboard. Use Download." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} size={POSTER_WIDTH + 64} centered title={<Text fw={800}>Share {category}</Text>}>
      <Group justify="space-between" mb="sm" wrap="wrap">
        <Group gap="xs">
          <Text fz="sm" c="dimmed">Covers per tier</Text>
          <SegmentedControl size="xs" value={density} onChange={setDensity} data={['10', '20', '40', '80']} />
        </Group>
        <Group gap="xs">
          <Button variant="default" leftSection={<Copy size={15} />} onClick={copy} loading={busy === 'copy'}>
            Copy image
          </Button>
          <Button leftSection={<Download size={15} />} onClick={download} loading={busy === 'download'}>
            Download PNG
          </Button>
        </Group>
      </Group>
      <ScrollArea.Autosize mah="70vh" type="auto">
        <Box ref={posterRef} w={POSTER_WIDTH}>
          <Poster category={category} tiers={tiers} tierItems={tierItems} perTier={perTier} />
        </Box>
      </ScrollArea.Autosize>
    </Modal>
  );
}
