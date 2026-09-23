import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Box, Portal } from '@mantine/core';

// Vimium-style link hints: `f` labels every visible clickable thing with a
// short letter code; typing the code clicks it (or focuses it, for a text
// box). No mainstream library does this for a React app, so it's written
// here - small, and built only on DOM queries + a Mantine Portal/Box.

// Home-row first, as in Vimium.
const ALPHABET = 'sadfjklewcmpgh';

const CLICKABLE = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'textarea',
  'select',
  '[role="button"]',
  '[role="tab"]',
  '[role="radio"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="option"]',
  '[role="menuitem"]',
  '[role="link"]',
  '[tabindex]:not([tabindex="-1"])',
  '[draggable="true"]',
  '[data-hint]',
].join(',');

function isTextField(el) {
  return el.matches('input, textarea, select, [contenteditable="true"]');
}

// Visible, enabled and not covered by something else (a modal, the dock).
function findTargets() {
  const seen = new Set();
  const targets = [];
  for (const el of document.querySelectorAll(CLICKABLE)) {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[inert], [aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) continue;
    const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1);
    const y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(el === hit || el.contains(hit) || hit.contains(el))) continue;
    // A clickable inside another clickable with the same box (a Mantine
    // Button's inner span with role, a NavLink's body) gets one hint.
    const key = `${Math.round(r.left)}:${Math.round(r.top)}:${Math.round(r.width)}:${Math.round(r.height)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ el, top: Math.max(r.top, 0), left: Math.max(r.left, 0) });
  }
  return targets;
}

// Equal-length codes, so no code is a prefix of another.
function codes(n) {
  let length = 1;
  while (ALPHABET.length ** length < n) length++;
  const out = [];
  for (let i = 0; i < n; i++) {
    let code = '';
    for (let j = 0, k = i; j < length; j++, k = Math.floor(k / ALPHABET.length)) code = ALPHABET[k % ALPHABET.length] + code;
    out.push(code);
  }
  return out;
}

function activate(el) {
  if (isTextField(el)) {
    el.focus();
    return;
  }
  el.focus({ preventScroll: true });
  el.click();
}

const LinkHints = forwardRef(function LinkHints(_, ref) {
  const [hints, setHints] = useState(null); // [{ el, top, left, code }] while active
  const [typed, setTyped] = useState('');

  useImperativeHandle(ref, () => ({
    open() {
      const targets = findTargets();
      if (!targets.length) return;
      const labels = codes(targets.length);
      setTyped('');
      setHints(targets.map((t, i) => ({ ...t, code: labels[i] })));
    },
  }));

  useEffect(() => {
    if (!hints) return;
    const close = () => setHints(null);
    // Capture phase + stopImmediatePropagation: while hints are up, every key
    // belongs to them - nothing else on the page reacts.
    function onKeyDown(e) {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Backspace') {
        setTyped((t) => t.slice(0, -1));
        return;
      }
      const key = e.key.toLowerCase();
      if (e.key === 'Escape' || e.ctrlKey || e.metaKey || e.altKey || !ALPHABET.includes(key)) return close();
      const next = typed + key;
      const matching = hints.filter((h) => h.code.startsWith(next));
      if (!matching.length) return close();
      if (matching.length === 1 && matching[0].code === next) {
        close();
        activate(matching[0].el);
        return;
      }
      setTyped(next);
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('scroll', close, { capture: true, passive: true });
    window.addEventListener('resize', close);
    window.addEventListener('mousedown', close, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('resize', close);
      window.removeEventListener('mousedown', close, { capture: true });
    };
  }, [hints, typed]);

  if (!hints) return null;
  return (
    <Portal>
      {hints
        .filter((h) => h.code.startsWith(typed))
        .map((h) => (
          <Box
            key={h.code}
            pos="fixed"
            top={h.top}
            left={h.left}
            px={4}
            py={1}
            bg="var(--tier-t3)"
            c="var(--tier-ink)"
            ff="monospace"
            fz={11}
            fw={800}
            lh={1.3}
            tt="uppercase"
            style={{
              zIndex: 10000,
              borderRadius: 3,
              border: '1px solid var(--shadow)',
              boxShadow: '0 2px 6px var(--shadow)',
              pointerEvents: 'none',
            }}
          >
            <Box component="span" opacity={0.4}>
              {h.code.slice(0, typed.length)}
            </Box>
            {h.code.slice(typed.length)}
          </Box>
        ))}
    </Portal>
  );
});

export default LinkHints;
