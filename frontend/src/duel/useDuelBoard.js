import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { notifications } from '@mantine/notifications';
import { selectDuelLayout } from '../store/selectors';
import { applyOrderWithFeedback, moveWithFeedback } from '../tierActions';
import { songLabel } from '../tierUtils';
import { errorMessage } from '../api/client';
import { useDuelDecisionMutation, useDuelLockMutation } from '../api/queries';
import { dropIndexByScore } from './duelText';
import { TIER_ORDER } from '../tiers';
import { useShellActions } from '../layout/shellActions';

// What every duel page needs about the open board: its songs (by id), names,
// the layout the API wants, and the actions on suggested moves. Moves go
// through tierActions like every tier edit (toast, Ctrl+Z), and a Move means
// it: that song's move goes to YouTube at once (App's pushSongs - only those
// songs; any other staged edit stays staged for the bar's Push).
export function useDuelBoard(category) {
  const dispatch = useDispatch();
  const tierItems = useSelector((s) => s.tiers.tierItems);
  const duelLayout = useSelector(selectDuelLayout);
  const decision = useDuelDecisionMutation(category);
  const lock = useDuelLockMutation(category);
  const pushSongs = useShellActions().pushSongs;
  const push = (videoIds) => pushSongs?.(category, videoIds);

  const videoMap = useMemo(() => {
    const map = new Map();
    Object.values(tierItems).forEach((list) => list?.forEach((v) => map.has(v.videoId) || map.set(v.videoId, v)));
    return map;
  }, [tierItems]);
  const videoOf = (id) => videoMap.get(id);
  const nameOf = (id) => (videoMap.get(id) ? songLabel(videoMap.get(id)).song : 'A song no longer on this board');
  const artistOf = (id) => (videoMap.get(id) ? songLabel(videoMap.get(id)).artist : '');

  const failed = (err) =>
    notifications.show({ color: 'red', title: 'Couldn’t save that', message: errorMessage(err, 'The app couldn’t reach the server.') });

  // The ranked tier a song is in on the board right now (null: on the to-do
  // list or no longer on the board).
  const rankedTierOf = (id) => TIER_ORDER.find((t) => tierItems[t]?.some((v) => v.videoId === id)) ?? null;

  // Move: the move (placed among its new tier by score), recorded. Several at
  // once (Move all) push together: pass push = false and call pushNow(ids).
  // The song moves from wherever it is now - a list shown a step behind the
  // board (you dragged it meanwhile) still moves it, never a silent no-op.
  // Returns false when there's nothing to move (the song left the ranked tiers).
  function accept(s, muOf, { push: pushIt = true } = {}) {
    const at = rankedTierOf(s.song);
    if (!at) {
      notifications.show({ title: 'That song isn’t in a ranked tier any more', message: `${nameOf(s.song)} - nothing was moved.` });
      return false;
    }
    if (at !== s.to) {
      const target = (tierItems[s.to] || []).map((v) => v.videoId).filter((id) => id !== s.song);
      const dropIndex = dropIndexByScore(target, muOf(s.song) ?? -Infinity, muOf);
      dispatch(moveWithFeedback([{ fromTier: at, toTier: s.to, videoId: s.song, dropIndex }]));
    }
    decision.mutate({ videoId: s.song, decision: 'ACCEPTED', from: s.from, to: s.to, confidence: s.confidence }, { onError: failed });
    if (pushIt) push([s.song]);
    return true;
  }

  function keep(s) {
    decision.mutate({ videoId: s.song, decision: 'KEPT', from: s.from, to: s.to, confidence: s.confidence }, { onError: failed });
  }

  // Take back a Move (move it back where it was) or a Keep.
  function undo(s, wasMove) {
    const at = wasMove ? rankedTierOf(s.song) : null;
    if (at && at !== s.from) {
      dispatch(moveWithFeedback([{ fromTier: at, toTier: s.from, videoId: s.song }]));
      push([s.song]);
    }
    decision.mutate({ videoId: s.song, decision: null }, { onError: failed });
  }

  function setLocked(videoId, locked) {
    lock.mutate({ videoId, locked }, { onError: failed });
  }

  // "Order within a tier is just sorting by score." Only the tier's own
  // songs, as they are now: an order from an analysis a step behind the
  // board (a song moved out since, or in) never pulls a song into this tier
  // or drops one - songs it doesn't name keep their place at the end.
  function applyTierOrder(tier, ids) {
    const items = tierItems[tier] || [];
    const byId = new Map(items.map((v) => [v.videoId, v]));
    const named = new Set(ids);
    const ordered = [...new Set(ids)].filter((id) => byId.has(id)).map((id) => byId.get(id));
    dispatch(applyOrderWithFeedback({ [tier]: [...ordered, ...items.filter((v) => !named.has(v.videoId))] }));
  }

  return { tierItems, duelLayout, videoOf, nameOf, artistOf, accept, pushNow: push, keep, undo, setLocked, applyTierOrder };
}
