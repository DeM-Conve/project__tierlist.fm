# Contributing to Tierlist.fm

Thanks for helping out! Tierlist.fm is a self-hosted tool - see the
[README](README.md) to run it locally and the [LICENSE](LICENSE) for what the
Business Source License allows.

## Branches

| Branch | What it is |
|---|---|
| `main` | Stable. Every commit is a released version, tagged `vX.Y.Z`. The default branch - what you get when you clone. |
| `dev` | Integration. Where work lands first; may be ahead of `main` and less tested. |
| `feat/*`, `fix/*`, `docs/*`, `chore/*` | Short-lived topic branches, cut from `dev`, deleted after merging. |

```
feat/x ──┐
fix/y  ──┤  PR into dev
         ▼
 dev  ──●──●──●──●──●──      (day-to-day work)
              │  release: merge dev -> main, tag
              ▼
 main ────────●──────────    v0.1.0, v0.2.0, ...
```

**Pull requests target `dev`, not `main`.** `main` only moves when a release
is cut.

## Workflow

1. Fork, then branch from `dev`: `git switch -c feat/short-description dev`
2. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   `feat(board): ...`, `fix(player): ...`, `docs: ...`, `chore: ...`.
3. Keep your branch current with `git rebase dev` (not merge commits).
4. Open a PR into `dev`. Fill in the template; include a screenshot for UI changes.
5. Before pushing:
   - frontend: `cd frontend && npx vite build`
   - backend: `cd backend && mvn verify` (needs Docker for the Testcontainers ITs)

## Releases (maintainers)

1. Open a PR `dev` -> `main` titled `release: vX.Y.Z`, merge it with a merge commit.
2. Tag the merge commit on `main`: `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`.
3. Publish a GitHub Release from the tag with the notes.

Versions follow [SemVer](https://semver.org/): while below `1.0.0`, a minor
bump (`0.x.0`) may include breaking changes.
