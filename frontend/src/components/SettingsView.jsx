import { useState } from 'react';
import { DUEL_STRATEGIES, DUEL_STRATEGY_LABELS, DEFAULT_DUEL_STRATEGY } from '../duel';
import { SETTINGS, getSetting, setSetting } from '../settings';

const CATEGORIES = [{ key: 'duels', label: 'Duels' }];

const STRATEGY_DESCRIPTIONS = {
  tierAwareMerge:
    "Trusts your current tier placement and only settles disagreements between tiers. Far fewer duels for a real library.",
  mergeSort:
    "Ignores current tiers and re-derives a full ranking from scratch. More duels, but doesn't assume your existing tiers are correct.",
  elo: "Chess-style rating over random pairs. Tolerates skipping a duel you're unsure about, at the cost of an approximate rather than exact order.",
};

export default function SettingsView() {
  const [category, setCategory] = useState('duels');
  const [duelStrategy, setDuelStrategy] = useState(() =>
    getSetting(SETTINGS.duelStrategy, DEFAULT_DUEL_STRATEGY)
  );

  function chooseStrategy(key) {
    setDuelStrategy(key);
    setSetting(SETTINGS.duelStrategy, key);
  }

  return (
    <section className="settings-view">
      <div className="canvas-header">
        <h1>Settings</h1>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              className={`sidebar-item${category === c.key ? ' sidebar-item-active' : ''}`}
              onClick={() => setCategory(c.key)}
            >
              {c.label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {category === 'duels' && (
            <div className="settings-section">
              <h2>Duel ranking algorithm</h2>
              <p className="hint-text">
                Used as the default whenever you start a new duel session. You can still switch
                strategies for a single session from the duel screen itself.
              </p>

              <div className="settings-options">
                {Object.keys(DUEL_STRATEGIES).map((key) => (
                  <button
                    key={key}
                    className={`settings-option${duelStrategy === key ? ' settings-option-active' : ''}`}
                    onClick={() => chooseStrategy(key)}
                  >
                    <span className="settings-option-radio" />
                    <span className="settings-option-text">
                      <span className="settings-option-label">{DUEL_STRATEGY_LABELS[key]}</span>
                      <span className="settings-option-desc">{STRATEGY_DESCRIPTIONS[key]}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
