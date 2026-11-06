---
id: ZN-997
title: 'Harden state: UI gestures and navigation'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-06 07:48'
labels:
  - size-M
  - ui
  - hardening
dependencies: []
ordinal: 756080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/implicit-state-machines.md (lib/std section: ui.ts gestures, navigation.tsx, react-native.tsx, kit/keyboard, kit/imageviewer). Reproduce each case first; drop what does not reproduce.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ui.ts: releaseAt early returns and a non-primary button release leave no press/drag state set; a release while the app is in the background is seen; regression test
- [ ] #2 ui.ts: lifting the second finger of a pinch first gives pan and scroll back to the remaining finger; regression test
- [ ] #3 navigation.tsx: push/pop/swipe/backstart during a transition finish or cancel it cleanly; Presented.close twice pops only the modal; regression test
- [ ] #4 react-native.tsx Press releases (onPressOut) on a tap whose down and up land in one frame; Alert close runs once; regression test
- [ ] #5 kit/keyboard.tsx stops key repeat and the accent popup on pointer cancel or leave; kit/imageviewer.ts ignores gestures while closing
<!-- AC:END -->
