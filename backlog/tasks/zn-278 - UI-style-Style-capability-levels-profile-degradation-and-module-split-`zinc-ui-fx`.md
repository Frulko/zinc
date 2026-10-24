---
id: ZN-278
title: 'Style levels: warning on ignored properties'
status: Backlog
assignee: []
created_date: '2026-10-07 12:58'
updated_date: '2026-10-24 23:58'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-175
  - ZN-183
  - ZN-251
ordinal: 55200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** Mac part: a program using blur/extended keys on a small profile builds with a named warning (error with "style":"strict") and `zinc doctor` lists ignored properties; esp32 size check goes to later.md.

From docs/reports/ui-style-system.md (section 6, ST-29). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An esp32 build of hero-lite without extended keys: `size` of the image within +-1% of the baseline (recorded).
- [ ] #2 A program using `blur` on esp32 builds with a named warning, fails under `"style": "strict"`.
- [ ] #3 `zinc doctor` prints the style level and the properties ignored by the last build.
- [ ] #4 the B10 feature-matrix scene renders at forced T0, T1, T2 and T3 against per-tier goldens (from ZN-277: no tier switch exists yet)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. Style capability levels / strict mode are cross-profile work; keep the Mac-checkable part (doctor line, named warning) and take AC3 of ZN-277. Evidence: no style level in zinc doctor; tools/build for esp32 is cross
<!-- SECTION:NOTES:END -->
