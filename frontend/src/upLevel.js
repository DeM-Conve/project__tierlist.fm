import { matchPath } from 'react-router-dom';

// Where "up one level" goes from each page - the one answer both `g u`
// (keyboard/useVimKeys.js) and every page's "← parent" crumb
// (components/UpCrumb.jsx) read, so the key and the link never disagree:
//   tier page -> board -> Home; duel hub -> board;
//   Suggested moves / a matchup / a session summary -> duel hub;
//   Settings, Add songs (and anything else) -> Home; Home has no parent.
// Leaving a matchup ends nothing: the session stays resumable from the hub.
const board = (category) => `/tier/${encodeURIComponent(category)}`;
const toBoard = (category) => ({ to: board(category), label: `${category} · tier list` });
const toHub = (category) => ({ to: `${board(category)}/duel`, label: `${category} · Duel` });
const HOME = { to: '/', label: 'Home' };
// matchPath leaves params as they are in the address (encoded).
const decode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const LEVELS = [
  ['/tier/:category/t/:tier', toBoard],
  ['/tier/:category/duel', toBoard],
  ['/tier/:category/duel/moves', toHub],
  ['/tier/:category/duel/play/:sessionId', toHub],
  ['/tier/:category/duel/done/:sessionId', toHub],
];

// `{ to, label }` for the page at `pathname`, or null on Home.
export function parentOf(pathname) {
  if (matchPath('/', pathname)) return null;
  for (const [pattern, up] of LEVELS) {
    const m = matchPath(pattern, pathname);
    if (m) return up(decode(m.params.category));
  }
  return HOME;
}
