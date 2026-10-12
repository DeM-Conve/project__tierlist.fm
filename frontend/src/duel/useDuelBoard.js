import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useOutletContext } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { selectDuelLayout } from '../store/selectors';
import { applyOrderWithFeedback, moveWithFeedback } from '../tierActions';
import { songLabel } from '../tierUtils';
import { errorMessage } from '../api/client';
import { useDuelDecisionMutation, useDuelLockMutation } from '../api/queries';
import { dropIndexByScore } from './duelText';

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
  const pushSongs = useOutletContext()?.pushSongs;
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

  // Move: the move (placed among its new tier by score), recorded. Several at
  // once (Move all) push together: pass push = false and call pushNow(ids).
  function accept(s, muOf, { push: pushIt = true } = {}) {
    const target = (tierItems[s.to] || []).map((v) => v.videoId).filter((id) => id !== s.song);
    const dropIndex = dropIndexByScore(target, muOf(s.song) ?? -Infinity, muOf);
    dispatch(moveWithFeedback([{ fromTier: s.from, toTier: s.to, videoId: s.song, dropIndex }]));
    decision.mutate({ videoId: s.song, decision: 'ACCEPTED', from: s.from, to: s.to, confidence: s.confidence }, { onError: failed });
    if (pushIt) push([s.song]);
  }

  function keep(s) {
    decision.mutate({ videoId: s.song, decision: 'KEPT', from: s.from, to: s.to, confidence: s.confidence }, { onError: failed });
  }

  // Take back a Move (move it back where it was) or a Keep.
  function undo(s, wasMove) {
    if (wasMove) {
      dispatch(moveWithFeedback([{ fromTier: s.to, toTier: s.from, videoId: s.song }]));
      push([s.song]);
    }
    decision.mutate({ videoId: s.song, decision: null }, { onError: failed });
  }

  function setLocked(videoId, locked) {
    lock.mutate({ videoId, locked }, { onError: failed });
  }

  // "Order within a tier is just sorting by score."
  function applyTierOrder(tier, ids) {
    dispatch(applyOrderWithFeedback({ [tier]: ids.map((id) => videoMap.get(id)).filter(Boolean) }));
  }

  return { tierItems, duelLayout, videoOf, nameOf, artistOf, accept, pushNow: push, keep, undo, setLocked, applyTierOrder };
}
