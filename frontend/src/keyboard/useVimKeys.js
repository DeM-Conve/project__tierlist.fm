import { useHotkeys } from 'react-hotkeys-hook';
import { useNavigate } from 'react-router-dom';
import { spotlight } from '@mantine/spotlight';
import { notifications } from '@mantine/notifications';
import { TODO_TIER } from '../tiers';
import { youtubeUrl } from '../tierUtils';
import './sequence';

const board = (category, rest = '') => `/tier/${encodeURIComponent(category)}${rest}`;

// App-wide Vimium-style keys (react-hotkeys-hook: `>` joins a sequence; form
// fields are ignored by default). Page-level keys (board search, player,
// Add songs, duel) stay in their own components - see shortcuts.js for the list.
export function useVimKeys({ hintsRef, categories, currentCategory, playingCategory, playingVideoId, hasTodo }) {
  const navigate = useNavigate();
  const go = (path) => (e) => {
    e.preventDefault();
    navigate(path);
  };
  const deps = [categories, currentCategory, playingCategory, playingVideoId, hasTodo];

  useHotkeys('f', (e) => {
    e.preventDefault();
    hintsRef.current?.open();
  });
  useHotkeys('o', (e) => {
    e.preventDefault();
    spotlight.open();
  });

  useHotkeys('g>h', go('/'));
  useHotkeys('a', (e) => {
    e.preventDefault();
    navigate('/add', { state: { focusInput: true } });
  });
  useHotkeys('g>s', go('/settings'));
  useHotkeys('g>p', (e) => playingCategory && go(board(playingCategory))(e), deps);
  useHotkeys('g>b', (e) => currentCategory && go(board(currentCategory))(e), deps);
  useHotkeys('g>d', (e) => currentCategory && go(board(currentCategory, '/duel'))(e), deps);
  useHotkeys('g>t', (e) => currentCategory && hasTodo && go(board(currentCategory, `/t/${TODO_TIER}`))(e), deps);
  useHotkeys('g>g', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  useHotkeys('shift+g', () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));

  // Previous / next board, in sidebar order (from anywhere: the first/last).
  useHotkeys(
    ['[', ']'],
    (e) => {
      if (!categories.length) return;
      e.preventDefault();
      const step = e.key === ']' ? 1 : -1;
      const i = categories.indexOf(currentCategory);
      const next = i < 0 ? (step > 0 ? 0 : categories.length - 1) : (i + step + categories.length) % categories.length;
      navigate(board(categories[next]));
    },
    { useKey: true },
    deps
  );

  // Back / forward, like Vimium's H / L.
  useHotkeys('shift+h', () => navigate(-1));
  useHotkeys('shift+l', () => navigate(1));

  // Copy the playing song's YouTube link (else this page's address).
  useHotkeys(
    'y>y',
    () => {
      const url = playingVideoId ? youtubeUrl(playingVideoId) : window.location.href;
      navigator.clipboard?.writeText(url).then(
        () => notifications.show({ message: playingVideoId ? 'Copied the playing song’s YouTube link' : 'Copied this page’s link' }),
        () => notifications.show({ color: 'red', message: 'Couldn’t copy to the clipboard' })
      );
    },
    deps
  );
}
