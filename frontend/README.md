# Tierlist.fm frontend

React 19 + Vite single-page app. See the repository root for everything else:

- [README](../README.md) - what Tierlist.fm is, self-hosting, dev setup
- [CLAUDE.md](../CLAUDE.md) - stack, conventions and rules for changing this code
- [docs/architecture.md](../docs/architecture.md) - how the pieces fit, the API, the data model
- [docs/features.md](../docs/features.md) - every feature and keyboard shortcut

```bash
npm install
npm run dev     # Vite dev server; proxies /api/ and Google login to the backend (BACKEND_ORIGIN)
npm test        # Vitest + Testing Library
npm run lint    # oxlint
npm run build   # production bundle in dist/ (BASE_PATH for a sub-path)
```
