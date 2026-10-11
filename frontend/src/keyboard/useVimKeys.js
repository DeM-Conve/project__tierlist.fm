import { useHotkeys } from 'react-hotkeys-hook';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { spotlight } from '@mantine/spotlight';
import { notifications } from '@mantine/notifications';
import { TODO_TIER } from '../tiers';
import { youtubeUrl } from '../tierUtils';
import { selectPlayerCoversPage } from '../store/selectors';
import { parentOf } from '../upLevel';
import './sequence';

const board = (category, rest = '') => `/tier/${encodeURIComponent(category)}${rest}`;

// App-wide Vimium-style keys (react-hotkeys-hook: `>` joins a sequence; form
// fields are ignored by default). Page-level keys (board search, player,
// Add songs, duel) stay in their own components - see shortcuts.js for the list.
export function useVimKeys({ hintsRef, canvasRef, categories, currentCategory, playingCategory, playingVideoId, hasTodo }) {
  const navigate = useNavigate();
  const go = (path) => (e) => {
    e.preventDefault();
    navigate(path);
  };
  const deps = [categories, currentCategory, playingCategory, playingVideoId, hasTodo];
  // The expanded player covers the page and takes `f` for fullscreen video.
  const playerCoversPage = useSelector(selectPlayerCoversPage);

  useHotkeys(
    'f',
    (e) => {
      e.preventDefault();
      hintsRef.current?.open();
    },
    { enabled: !playerCoversPage },
  );
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
  // Vimium's "go up": one level up (upLevel.js - the same target as every
  // page's "← parent" crumb). Home has no parent.
  const { pathname } = useLocation();
  useHotkeys(
    'g>u',
    (e) => {
      const up = parentOf(pathname);
      if (!up) return;
      e.preventDefault();
      navigate(up.to);
    },
    [pathname]
  );
  useHotkeys('g>d', (e) => currentCategory && go(board(currentCategory, '/duel'))(e), deps);
  useHotkeys('g>t', (e) => currentCategory && hasTodo && go(board(currentCategory, `/t/${TODO_TIER}`))(e), deps);
  // The page canvas scrolls, not the window (see layout/canvas.js).
  useHotkeys('g>g', () => canvasRef.current?.scrollTo({ top: 0, behavior: 'smooth' }));
  useHotkeys('shift+g', () =>
    canvasRef.current?.scrollTo({ top: canvasRef.current.scrollHeight, behavior: 'smooth' })
  );

  // Half a page down / up, like Vim's Ctrl+d / Ctrl+u (Ctrl, not Cmd, on a
  // Mac too - as in Vim; it also keeps Cmd+D / Cmd+U for the browser).
  const halfPage = (dir) => (e) => {
    const el = canvasRef.current;
    if (!el) return;
    e.preventDefault();
    el.scrollBy({ top: (dir * el.clientHeight) / 2, behavior: 'smooth' });
  };
  useHotkeys('ctrl+d', halfPage(1), { enabled: !playerCoversPage });
  useHotkeys('ctrl+u', halfPage(-1), { enabled: !playerCoversPage });

  // Vimium's "g i": focus the page's first text box (Home's filter, a tier
  // page's filter, Add songs' link box, Settings' template...).
  useHotkeys(
    'g>i',
    (e) => {
      const input = canvasRef.current?.querySelector(
        'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([disabled]), textarea:not([disabled])'
      );
      if (!input) return;
      e.preventDefault();
      input.focus();
    },
    { enabled: !playerCoversPage }
  );

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
