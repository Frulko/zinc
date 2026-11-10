---
id: ZN-1112
title: Reveal selected tabs inside narrow scroll tracks
status: Backlog
assignee: []
created_date: '2026-11-10 02:26'
labels:
  - ui
  - size-S
milestone: m-32
dependencies: []
ordinal: 1218
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Settings23 narrow page exposes clipped selected/focused tabs. Minimal default Quiet Tabs in a width360 p4 View, four labels Profile/Notifications/Appearance/Account, className=w-full. End on Profile selects3, but at48frames scrollLeft remains0 on all3; track[16,16,328,36] right344, Account right416 interp/AOT or360 QuickJS. Original Settings Account label/focus truncated. Repro and all3 logs .logs/blockers/tabs-reveal/tabs-repro and tabs-*.log. Fix existing Tabs/reveal owner rather than caller sizing/wrapping or a new widget; inspect NavigationTabs/shared reveal callers, motion/reduced motion and nested scroll. Source lib/std/kit/tabs.tsx uses ScrollView and revealTab; source of failure not assumed. Keep existing keyboard/disabled/controlled contracts, dispose watchers. Primary short research https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ (roving keyboard and End selection); Sonnet unavailable. Protected lib/std/ui.ts/runtime/HAL external WIP and frontend1111 belong to other sessions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Existing Tabs and shared reveal callers keep selected and focused tabs within the scroll viewport after keyboard, pointer and controlled selection, with reduced motion and lifecycle cleanup preserved
- [ ] #2 Exact small T0 regression and original unchanged Settings narrow reproduction pass across all three engines; unchanged public kit size thresholds pass
<!-- AC:END -->
