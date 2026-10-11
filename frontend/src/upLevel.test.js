import { describe, expect, it } from 'vitest';
import { parentOf } from './upLevel';

describe('parentOf', () => {
  it.each([
    ['/tier/Rap/t/S', { to: '/tier/Rap', label: 'Rap · tier list' }],
    ['/tier/Rap/t/TODO', { to: '/tier/Rap', label: 'Rap · tier list' }],
    ['/tier/Rap', { to: '/', label: 'Home' }],
    ['/tier/Rap/duel', { to: '/tier/Rap', label: 'Rap · tier list' }],
    ['/tier/Rap/duel/moves', { to: '/tier/Rap/duel', label: 'Rap · Duel' }],
    ['/tier/Rap/duel/play/s1', { to: '/tier/Rap/duel', label: 'Rap · Duel' }],
    ['/tier/Rap/duel/done/s1', { to: '/tier/Rap/duel', label: 'Rap · Duel' }],
    ['/settings', { to: '/', label: 'Home' }],
    ['/add', { to: '/', label: 'Home' }],
    ['/playlist/PL1', { to: '/', label: 'Home' }],
  ])('%s goes up to %o', (path, up) => {
    expect(parentOf(path)).toEqual(up);
  });

  it('Home has no parent', () => {
    expect(parentOf('/')).toBeNull();
  });

  it('decodes the board name for the label and keeps it encoded in the link', () => {
    expect(parentOf('/tier/Jazz%20Cozy/duel/moves')).toEqual({ to: '/tier/Jazz%20Cozy/duel', label: 'Jazz Cozy · Duel' });
    expect(parentOf('/tier/R%26B/t/A')).toEqual({ to: '/tier/R%26B', label: 'R&B · tier list' });
  });

  it('tolerates a trailing slash', () => {
    expect(parentOf('/tier/Rap/duel/')).toEqual({ to: '/tier/Rap', label: 'Rap · tier list' });
  });
});
