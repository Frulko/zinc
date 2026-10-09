---
id: ZN-607
title: Trackpad scrolling locks to the dominant axis
status: Backlog
assignee: []
created_date: '2026-10-09 15:07'
labels:
  - ui
milestone: m-21
dependencies: []
priority: medium
ordinal: 5101
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen on examples/nuxt-ui (owner): a mostly vertical two-finger swipe also pans sideways once a scroll container overflows on X, because trackpadInput passes both deltas to directScroll (lib/std/ui.ts around 3545 and 3960-3990). macOS scroll views and Safari lock a swipe to its dominant axis: pick the axis on the first non-zero sample of a gesture and pass 0 for the other until the fingers lift (scroll phase end); a diagonal start or a clearly 2D content (a map, a canvas) keeps both. The nuxt-ui sections that overflowed were fixed by letting their rows wrap (fix 2026-10-09).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a vertical swipe with a small horizontal drift does not move a 2D scroller sideways (scroll_axis case)
- [ ] #2 a horizontal swipe still scrolls a wide table
<!-- AC:END -->
