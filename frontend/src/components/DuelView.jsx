import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_DUEL_STRATEGY, DUEL_STRATEGIES, DUEL_STRATEGY_LABELS } from '../duel';
import { SETTINGS, getSetting, setSetting } from '../settings';
import { TIER_COLORS } from '../tiers';
import EmbeddedPlayer from './EmbeddedPlayer';

function DuelCard({ video, tier, isPreviewing, onTogglePreview, onChoose }) {
  return (
    <div className="duel-card" onClick={onChoose}>
      <div className="duel-card-media">
        {tier && (
          <span className="tier-chip duel-card-tier" style={{ background: TIER_COLORS[tier] }}>
            {tier}
          </span>
        )}
        {isPreviewing ? (
          <EmbeddedPlayer videoId={video.videoId} autoplay />
        ) : (
          <img src={video.thumbnail || ''} alt={video.title} />
        )}
        <button
          className="duel-card-preview-btn"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePreview();
          }}
        >
          {isPreviewing ? '✕ Stop' : '▶ Preview'}
        </button>
      </div>
      <p className="duel-card-title">{video.title}</p>
      <p className="hint-text">{video.channelTitle}</p>
    </div>
  );
}

export default function DuelView({ videos, runs, tierSizes, onComplete, onCancel }) {
  const [strategyKey, setStrategyKeyState] = useState(() =>
    getSetting(SETTINGS.duelStrategy, DEFAULT_DUEL_STRATEGY)
  );
  const [currentPair, setCurrentPair] = useState(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [spine, setSpine] = useState(null);
  const [previewing, setPreviewing] = useState(null);

  const strategyRef = useRef(null);
  const videoMapRef = useRef(new Map());
  videoMapRef.current = new Map(videos.map((v) => [v.videoId, v]));

  const tierOfId = useMemo(() => {
    const map = {};
    tierSizes.forEach((entry, i) => {
      (runs[i] || []).forEach((id) => {
        map[id] = entry.tier;
      });
    });
    return map;
  }, [runs, tierSizes]);

  // Picking a strategy here also updates the persisted default, so Settings
  // and the in-session dropdown always agree on "what happens next time."
  function setStrategyKey(key) {
    setStrategyKeyState(key);
    setSetting(SETTINGS.duelStrategy, key);
  }

  function advance(strategy) {
    const pair = strategy.nextPair();
    setProgress(strategy.getProgress());
    setPreviewing(null);
    if (!pair) {
      setCurrentPair(null);
      setSpine(strategy.getSpine());
    } else {
      setCurrentPair(pair);
    }
  }

  useEffect(() => {
    const ids = videos.map((v) => v.videoId);
    const strategy = DUEL_STRATEGIES[strategyKey]({ ids, runs });
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
            {spine
              ? 'All duels settled'
              : `${progress.completed} of ${progress.total} duels · ${pct}% settled`}
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
            <DuelCard
              video={a}
              tier={tierOfId[a.videoId]}
              isPreviewing={previewing === a.videoId}
              onTogglePreview={() => setPreviewing((p) => (p === a.videoId ? null : a.videoId))}
              onChoose={() => chooseWinner(a.videoId)}
            />
            <span className="duel-or">or</span>
            <DuelCard
              video={b}
              tier={tierOfId[b.videoId]}
              isPreviewing={previewing === b.videoId}
              onTogglePreview={() => setPreviewing((p) => (p === b.videoId ? null : b.videoId))}
              onChoose={() => chooseWinner(b.videoId)}
            />
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
