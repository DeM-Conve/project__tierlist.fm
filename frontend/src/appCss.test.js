import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// App.css is the fallback for what Mantine has no prop for (CLAUDE.md): when
// a component moves to Mantine, its class's rule goes in the same pass. This
// keeps the file from collecting orphaned rules.
const SRC = dirname(fileURLToPath(import.meta.url));

function sources() {
  return readdirSync(SRC, { recursive: true })
    .filter((f) => /\.(js|jsx)$/.test(f) && !/\.test\.(js|jsx)$/.test(f))
    .map((f) => readFileSync(join(SRC, f), 'utf8'))
    .join('\n');
}

function cssClasses() {
  const css = readFileSync(join(SRC, 'App.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // Selectors only (before each "{"), not property values like "0.15s".
  const selectors = css.match(/[^{}]+(?=\{)/g) ?? [];
  const names = new Set();
  for (const sel of selectors) for (const [, name] of sel.matchAll(/\.(-?[a-z_][\w-]*)/gi)) names.add(name);
  return [...names];
}

describe('App.css', () => {
  it('has no rule for a class nothing in src uses', () => {
    const code = sources();
    const unused = cssClasses().filter((name) => !new RegExp(`(^|[^\\w-])${name}($|[^\\w-])`).test(code));
    expect(unused).toEqual([]);
  });
});
