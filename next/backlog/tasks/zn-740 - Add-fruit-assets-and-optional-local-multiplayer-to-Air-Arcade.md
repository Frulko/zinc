---
id: ZN-740
title: Add fruit assets and optional local multiplayer to Air Arcade
status: Done
assignee: []
created_date: '2026-10-13 13:18'
updated_date: '2026-10-13 13:32'
labels:
  - games
  - plugins
  - size-M
dependencies: []
ordinal: 499410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner asks to recover Fruit Ninja assets and make multiplayer optional in the Leap Motion demo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Fruit 3D integrates downloaded fruit assets with recorded sources and reuse terms while retaining volumetric rendering and cut halves.
- [x] #2 Solo remains the default; a visible option enables two local players with distinct blades, independent scoring and stable tracking across lost hands.
- [x] #3 Targeted gameplay and UI checks pass on Zinc engines, controls and asset provenance are documented, and the updated demo is launched.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Bundled seven unmodified 1K CC0 skin/cut-face images from TextureCan, qubodup and nevak (3.8 MiB compressed); sources, original download URLs, SHA-256 hashes and the full CC0 licence are in assets/fruits. These are clearly documented reusable alternatives, not original Halfbrick assets. Existing Zinc image baking and 3D materials load them offline; cut-face UVs sample photos and an atlas without editing image bytes. No dependency or engine change.

Solo is the default. M or Solo/2 joueurs selects optional local competition with one Leap per player. Device assignments survive a lost stream/navigation; restart can rebind them. Independent blades, scores, combos and bomb penalties; earliest segment-circle contact owns a fruit once. Changing player count resets to ready. No network multiplayer added.

PASS next/tests/run --only leapmotion and next/tests/run --tier t1 --only leapmotion_demo after final code changes. Gameplay checks cover independent awards/penalties, first contact, no double award, solo ignoring player two, tracking loss/reacquisition and calibration/navigation continuity. The scripted UI exercises the keyboard and button toggles. Updated geometry/duel and new multiplayer goldens inspected; textured multiplayer frames match interpreter, QuickJS and AOT. Downloaded asset checksums verified.

Launched the updated real-tracking demo in solo for the owner. Both players scored in a deterministic simulated match. Two physical sensors together remain unverified; no cross-target tests or engine build were needed.
<!-- SECTION:NOTES:END -->
