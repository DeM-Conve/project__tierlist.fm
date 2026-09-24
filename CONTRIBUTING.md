# Contributing to Tierlist.fm

Thanks for helping out! Tierlist.fm is a self-hosted tool - see the
[README](README.md) to run it locally and the [LICENSE](LICENSE) for what the
Business Source License allows.

## Branches (trunk-based)

There is one long-lived branch: **`main`**. It is always buildable and is what
you get when you clone. Everything else is a short-lived topic branch.

| Branch | What it is |
|---|---|
| `main` | The trunk. All work lands here; releases are tags on it (`vX.Y.Z`). |
| `feat/*`, `fix/*`, `docs/*`, `chore/*`, `refactor/*` | Short-lived topic branches cut from `main`, merged back by PR within days, then deleted. |

```
feat/x ──●──●─┐
fix/y  ──●────┤  PR (squash merge)
              ▼
 main ──●──●──●──●──●──●──●──
           │        │
         v0.1.0   v0.2.0      (release tags)
```

## Workflow

1. Fork, then branch from `main`: `git switch -c feat/short-description main`
2. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   `feat(board): ...`, `fix(player): ...`, `docs: ...`, `chore: ...`.
3. Keep the branch small and current: `git fetch && git rebase origin/main`.
4. Open a PR into `main`. Fill in the template; include a screenshot for UI
   changes. PRs are **squash-merged**, so the PR title becomes the commit on
   `main` - make it a Conventional Commit.
5. Before pushing:
   - frontend: `cd frontend && npx vite build`
   - backend: `cd backend && mvn verify` (needs Docker for the Testcontainers ITs)

## Releases (maintainers)

Releases are tags on `main` - no release branches.

1. Pick the version (SemVer, below).
2. Tag `main`: `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`.
3. Publish a GitHub Release from the tag (`gh release create vX.Y.Z --generate-notes`).

Versions follow [SemVer](https://semver.org/): while below `1.0.0`, a minor
bump (`0.x.0`) may include breaking changes.
