import { afterEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import namingReducer, { setNaming } from './store/namingSlice';
import { syncTierLabels, tierName, useTierName } from './tierLabels';
import { DEFAULT_TIER_LABELS } from './tiers';
import { NO_DISPLAY_NAMES } from './naming';

const CUSTOM = { S: 'T1', A: 'T2', B: 'T3', C: 'T4', D: 'TZ', TODO: '(**TODO**)' };

afterEach(() => syncTierLabels({ tierLabels: DEFAULT_TIER_LABELS, tierDisplayNames: NO_DISPLAY_NAMES }));

describe('tierName (outside React)', () => {
  it('defaults to the slot names', () => {
    syncTierLabels({ tierLabels: DEFAULT_TIER_LABELS, tierDisplayNames: NO_DISPLAY_NAMES });
    expect(['S', 'A', 'B', 'C', 'D', 'TODO'].map(tierName)).toEqual(['S', 'A', 'B', 'C', 'D', 'TODO']);
  });

  it('uses the tier labels (names in playlist titles)', () => {
    syncTierLabels({ tierLabels: CUSTOM, tierDisplayNames: NO_DISPLAY_NAMES });
    expect(tierName('S')).toBe('T1');
    expect(tierName('TODO')).toBe('(**TODO**)');
  });

  it('a display name wins over the label', () => {
    syncTierLabels({ tierLabels: CUSTOM, tierDisplayNames: { ...NO_DISPLAY_NAMES, S: 'Gold', TODO: 'Later' } });
    expect(tierName('S')).toBe('Gold');
    expect(tierName('A')).toBe('T2');
    expect(tierName('TODO')).toBe('Later');
  });

  it('an empty display name falls back to the label', () => {
    syncTierLabels({ tierLabels: CUSTOM, tierDisplayNames: { ...NO_DISPLAY_NAMES, S: '' } });
    expect(tierName('S')).toBe('T1');
  });

  it('an unknown slot falls back to the slot itself', () => {
    expect(tierName('REMOVED')).toBe('REMOVED');
    expect(tierName('X')).toBe('X');
  });

  it('a naming without tierLabels keeps the previous labels but clears display names', () => {
    syncTierLabels({ tierLabels: CUSTOM, tierDisplayNames: { ...NO_DISPLAY_NAMES, S: 'Gold' } });
    syncTierLabels({});
    expect(tierName('S')).toBe('T1');
  });

  it('syncTierLabels(null/undefined) does not throw', () => {
    expect(() => syncTierLabels(null)).not.toThrow();
    expect(() => syncTierLabels(undefined)).not.toThrow();
    expect(tierName('A')).toBe('A');
  });

  it('unicode names', () => {
    syncTierLabels({ tierLabels: { ...DEFAULT_TIER_LABELS, S: '★★★★★' }, tierDisplayNames: { ...NO_DISPLAY_NAMES, A: 'Très bien' } });
    expect(tierName('S')).toBe('★★★★★');
    expect(tierName('A')).toBe('Très bien');
  });
});

describe('useTierName', () => {
  function setup() {
    const store = configureStore({ reducer: { naming: namingReducer } });
    const wrapper = ({ children }) => <Provider store={store}>{children}</Provider>;
    return { store, ...renderHook(() => useTierName(), { wrapper }) };
  }

  it('reads names from the store', () => {
    const { result } = setup();
    expect(result.current('S')).toBe('S');
    expect(result.current('TODO')).toBe('TODO');
  });

  it('re-renders when the naming changes', () => {
    const { store, result } = setup();
    act(() => {
      store.dispatch(setNaming({ template: '{category} {tier}', tierLabels: CUSTOM, tierDisplayNames: { ...NO_DISPLAY_NAMES, D: 'Meh' } }));
    });
    expect(result.current('S')).toBe('T1');
    expect(result.current('D')).toBe('Meh');
    expect(result.current('unknown')).toBe('unknown');
  });
});
