// Counts which components render, per user action, in the real App - the
// same "did this fiber render" signal React DevTools' profiler uses.
// The hook has to exist before react-dom loads (React checks for it once, and
// then times every fiber - ProfileMode), so setup.js imports this file first;
// it does nothing until a test calls renderProfiler.start().
// Test-only: never imported by the app.

const PERFORMED_WORK = 1;

function installRenderProfiler() {
  const state = { since: Infinity, counts: new Map(), commits: 0, ms: 0 };
  const visit = (fiber) => {
    for (let f = fiber; f; f = f.sibling) {
      if ((f.flags & PERFORMED_WORK) && f.actualStartTime >= state.since && typeof f.type !== 'string' && f.type) {
        const t = f.type.type ?? f.type.render ?? f.type;
        const name = f.type.displayName || t.displayName || t.name || 'Anonymous';
        state.counts.set(name, (state.counts.get(name) ?? 0) + 1);
      }
      if (f.child) visit(f.child);
    }
  };
  globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer) {
      this.renderers.set(1, renderer);
      return 1;
    },
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id, root) {
      if (state.since === Infinity) return;
      state.commits++;
      state.ms += root.current.actualDuration ?? 0;
      visit(root.current);
    },
  };
  return {
    // Starts counting (until the next start); returns nothing.
    start() {
      state.counts = new Map();
      state.commits = 0;
      state.ms = 0;
      state.since = performance.now();
    },
    stop() {
      state.since = Infinity;
    },
    // { total renders, commits, ms (root actualDuration summed), top [[name, n]] }
    report(top = 12) {
      const entries = [...state.counts.entries()].sort((a, b) => b[1] - a[1]);
      return {
        renders: entries.reduce((n, [, c]) => n + c, 0),
        commits: state.commits,
        ms: Math.round(state.ms),
        top: entries.slice(0, top),
        // The app's own components (library ones are named '@scope/pkg/Name').
        app: entries.filter(([name]) => !name.includes('/')).slice(0, top),
        count: (name) => state.counts.get(name) ?? 0,
      };
    },
  };
}

export const renderProfiler = installRenderProfiler();
