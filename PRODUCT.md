# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React 19 + Vite frontend (Mantine as the sole UI component library, Redux Toolkit for
client state, TanStack Query + axios for server state); Spring Boot 3 (Java 21) backend
with session-based Google OAuth2 login talking directly to the YouTube Data API v3;
deployed via Docker Compose. See the project's own conventions file for the full breakdown -
this is an existing codebase, not a greenfield stack choice.

## Users

Built first for its maintainer - someone who listens on YouTube Music and already keeps
playlists split by category and quality - and for anyone with the same habit who
self-hosts it. One instance serves every Google account its owner admits (each logs in
with their own account and sees only their own playlists, settings and duel history);
there is no cross-user viewing or sharing, and it is not offered as a hosted service.
Users are tech-comfortable and keyboard-heavy (VS Code / Vim conventions). Who it's for
in more detail: `docs/requirements.md`.

## Product Purpose

Lets a user log into their own YouTube account, browse their playlists, and organize
videos into a custom tier-list system. Playlists named by the user's own naming
template (`{category} {tier}`, with tier names they choose - `S A B C D` by default) are
auto-grouped into a tier board per category, so the "product" is really a structured way to rank and re-rank videos
already organized in YouTube, without leaving a tier-list mental model to do it in
spreadsheets or manually reordering playlists.

## Positioning

**The tier list is the moat.** Plain listening/browsing is what YouTube Music is for - this
app only earns its place through the tier list, so every surface should feel like (and be
driven by) the tier list rather than treating it as one page among many: a persistent Tier
Rail on board pages, a whole-board-at-a-glance tier view, tier-native ranking (Duel). (Direction set by the user, 2026-09-23; Quick sort and the
share image were removed later the same day - the user found them not good.)


Turns a user's own existing YouTube playlist naming convention directly into a live,
editable tier-list board with drag-and-drop and head-to-head "duel" ranking - a
neighboring tool would need users to re-enter/re-tag their catalog by hand instead of
reading structure straight out of playlist names they already maintain.

## Operating Context

Runs as a self-hosted Docker Compose stack (nginx frontend, Spring Boot backend,
Postgres, a nightly backup job) behind one origin. Session-based OAuth2 keeps sessions
in memory, so restarting the backend logs everyone out. YouTube playlists are the source
of truth for what's in each tier: board edits are staged in the browser and pushed to
the real playlists explicitly. Postgres holds only per-account settings and duel
history. Every account on an instance shares one Google Cloud project's YouTube API
quota (10,000 units/day by default), which shapes many features.

## Capabilities and Constraints

The full requirements (with the maintainer's explicit decisions and open questions) are
in `docs/requirements.md`; the feature list is `docs/features.md`. The ones that shape
design most:

- Duplicate videos are auto-resolved - no manual dedupe UI.
- Duel ranking is the backend engine: OpenSkill ratings per duel, a Bradley-Terry refit
  of the whole duel log, ordinal tier probabilities, and suggested tier moves that you
  approve - a single duel never moves a song.
- An embedded video player persists across navigation (mini bar / expanded / floating
  corner modes) and must never unmount/remount to change layout, since that would
  interrupt playback.
- Real Document Picture-in-Picture is not usable here - YouTube's iframe embed refuses to
  play in a separate top-level browsing context.
- **Future direction, not active work**: native iOS and Android apps are a longer-term
  possibility. Nothing about today's UI should be built as if native work is imminent;
  this is recorded so a future init/redesign pass knows it was already discussed.

## Brand Commitments

- **Name: Tierlist.fm** (chosen 2026-09-24). Use it
  everywhere the product names itself - tab title, sidebar and login logo.
  No fixed logo/voice yet.

## Evidence on Hand

No real user content, testimonials, or case studies - this is a working tool evaluated
against its own running code and the user's own YouTube data, not marketing material.

## Product Principles

- Read structure out of what the user already maintains (playlist naming) rather than
  asking them to re-enter it elsewhere.
- Never interrupt playback or lose in-progress duel/tier edits for a UI change - state
  continuity across navigation is a product guarantee, not a nice-to-have.
- Each user's account, playlists, and rankings are self-contained; don't design features
  that assume shared/cross-user visibility unless explicitly requested.
- Favor one coherent library (Mantine) and one data-fetching layer (TanStack Query) over
  ad hoc, per-feature choices, so the UI stays consistent as it grows.

## Accessibility & Inclusion

No specific accessibility requirement recorded (an open question in
`docs/requirements.md`).
