import { useEffect, useRef, useState } from 'react';
import { DUEL_STRATEGIES, DUEL_STRATEGY_LABELS } from '../duel';

export default function DuelView({ videos, tierSizes, onComplete, onCancel }) {
  const [strategyKey, setStrategyKey] = useState('mergeSort');
  const [currentPair, setCurrentPair] = useState(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [spine, setSpine] = useState(null);

  const strategyRef = useRef(null);
  const videoMapRef = useRef(new Map());
  videoMapRef.current = new Map(videos.map((v) => [v.videoId, v]));

  function advance(strategy) {
    const pair = strategy.nextPair();
    setProgress(strategy.getProgress());
    if (!pair) {
      setCurrentPair(null);
      setSpine(strategy.getSpine());
    } else {
      setCurrentPair(pair);
    }
  }

  useEffect(() => {
    const ids = videos.map((v) => v.videoId);
    const strategy = DUEL_STRATEGIES[strategyKey](ids);
    strategyRef.current = strategy;
    setSpine(null);
    advance(strategy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategyKey]);

  function chooseWinner(winnerId) {
    const strategy = strategyRef.current;
    strategy.reportResult(winnerId);
    advance(strategy);
  }

  function skip() {
    const strategy = strategyRef.current;
    if (!strategy?.supportsSkip) return;
    strategy.skip();
    advance(strategy);
  }

  function undo() {
    const strategy = strategyRef.current;
    if (!strategy?.undoLast) return;
    strategy.undoLast();
    setSpine(null);
    advance(strategy);
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (spine || !currentPair) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        chooseWinner(currentPair.a);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        chooseWinner(currentPair.b);
      } else if (e.key === ' ') {
        e.preventDefault();
        skip();
      } else if (e.key.toLowerCase() === 'u') {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPair, spine]);

  function finish() {
    if (!spine) return;
    const result = {};
    let cursor = 0;
    for (const { tier, count } of tierSizes) {
      result[tier] = spine.slice(cursor, cursor + count).map((id) => videoMapRef.current.get(id));
      cursor += count;
    }
    onComplete(result);
  }

  const strategy = strategyRef.current;
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const a = currentPair ? videoMapRef.current.get(currentPair.a) : null;
  const b = currentPair ? videoMapRef.current.get(currentPair.b) : null;

  return (
    <section className="duel-view">
      <div className="duel-header">
        <button className="btn btn-ghost" onClick={onCancel}>
          &larr; Cancel
        </button>

        <div className="duel-progress">
          <div className="duel-progress-bar">
            <div className="duel-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="hint-text">
            {spine ? 'All duels settled' : `${progress.completed} / ${progress.total} duels`}
          </span>
        </div>

        <select
          className="duel-strategy-select"
          value={strategyKey}
          onChange={(e) => setStrategyKey(e.target.value)}
        >
          {Object.keys(DUEL_STRATEGIES).map((key) => (
            <option key={key} value={key}>
              {DUEL_STRATEGY_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      {!spine && a && b && (
        <>
          <h1 className="duel-question">Which one deserves the higher tier?</h1>
          <div className="duel-pair">
            <button className="duel-card" onClick={() => chooseWinner(a.videoId)}>
              <img src={a.thumbnail || ''} alt={a.title} />
              <p className="duel-card-title">{a.title}</p>
              <p className="hint-text">{a.channelTitle}</p>
            </button>
            <span className="duel-or">or</span>
            <button className="duel-card" onClick={() => chooseWinner(b.videoId)}>
              <img src={b.thumbnail || ''} alt={b.title} />
              <p className="duel-card-title">{b.title}</p>
              <p className="hint-text">{b.channelTitle}</p>
            </button>
          </div>
          <p className="focus-hint">
            ← left wins · → right wins{strategy?.supportsSkip ? ' · space too close to call' : ''} · u undo
          </p>
        </>
      )}

      {spine && (
        <div className="duel-done">
          <h2>All set.</h2>
          <p className="hint-text">
            Apply this order to your tiers — each tier keeps its current number of videos, just
            re-filled from the new ranking.
          </p>
          <button className="btn btn-primary" onClick={finish}>
            Apply to tiers
          </button>
        </div>
      )}
    </section>
  );
}
