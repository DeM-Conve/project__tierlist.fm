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

Each user logs in with their own Google account and manages their own YouTube playlists
and tier lists - this is a shared multi-user tool, not a single-account personal tool.
There is no cross-user viewing/sharing built in; each account's playlists, tier boards,
and duel rankings are its own.

## Product Purpose

Lets a user log into their own YouTube account, browse their playlists, and organize
videos into a custom tier-list system. Playlists named with a
`[G]/[GA]/[OG] <Category> T1/T2/T3/TE/TZ` convention are auto-grouped into a tier board
per category, so the "product" is really a structured way to rank and re-rank videos
already organized in YouTube, without leaving a tier-list mental model to do it in
spreadsheets or manually reordering playlists.

## Positioning

Turns a user's own existing YouTube playlist naming convention directly into a live,
editable tier-list board with drag-and-drop and head-to-head "duel" ranking - a
neighboring tool would need users to re-enter/re-tag their catalog by hand instead of
reading structure straight out of playlist names they already maintain.

## Operating Context

Runs as a self-hosted Docker Compose stack (frontend + backend containers). Session-based
OAuth2 means rebuilding either container clears the in-memory session and requires
logging in again. Tier-board edits are staged as pending changes and synced back to the
real YouTube playlists explicitly, not saved to a separate database - YouTube playlists
are the source of truth.

## Capabilities and Constraints

- Duplicate videos across a board's tier playlists are auto-resolved (highest tier kept,
  others staged as pending removal) - no manual dedupe UI.
- Duel ranking supports multiple interchangeable algorithms (tier-aware merge, merge
  sort, Elo), swappable per-duel or set as a default in Settings.
- An embedded video player persists across navigation (mini bar / expanded / floating
  corner modes) and must never unmount/remount to change layout, since that would
  interrupt playback.
- Real Document Picture-in-Picture is not usable here - YouTube's iframe embed refuses to
  play in a separate top-level browsing context.
- **Future direction, not active work**: native iOS and Android apps are a longer-term
  possibility. Nothing about today's UI should be built as if native work is imminent;
  this is recorded so a future init/redesign pass knows it was already discussed.

## Brand Commitments

None established yet - no fixed name/logo/voice beyond the working project name
`project__yt`.

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

No specific accessibility requirement recorded.
