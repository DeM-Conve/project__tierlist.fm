import { describe, expect, it } from 'vitest';
import { enterStarts } from './hubEnter';

const el = (html) => {
  document.body.innerHTML = html;
  return document.getElementById('t');
};

describe('enterStarts', () => {
  it('starts from the page itself, a session length radio and a focus card', () => {
    expect(enterStarts(document.body)).toBe(true);
    expect(enterStarts(null)).toBe(true);
    expect(enterStarts(el('<div><p id="t">text</p></div>'))).toBe(true);
    expect(enterStarts(el('<input id="t" type="radio" />'))).toBe(true);
    expect(enterStarts(el('<button data-duel-focus="SMART_MIX"><span id="t">Smart mix</span></button>'))).toBe(true);
  });

  it('leaves Enter to a focused link, button or text field', () => {
    expect(enterStarts(el('<a id="t" href="/tier/Rock/duel/play/x">Resume</a>'))).toBe(false);
    expect(enterStarts(el('<button id="t">Move</button>'))).toBe(false);
    expect(enterStarts(el('<button><span id="t">Keep</span></button>'))).toBe(false);
    expect(enterStarts(el('<input id="t" type="text" />'))).toBe(false);
    expect(enterStarts(el('<textarea id="t"></textarea>'))).toBe(false);
  });
});
