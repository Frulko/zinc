---
id: ZN-882
title: 'zinc:ui: borders take layout space (border-box, as CSS and Yoga)'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 19:54'
labels:
  - ui
  - layout
  - size-M
milestone: m-28
dependencies: []
ordinal: 576460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-872: <View className="rounded-full border-2 border-[#23a55a]"><Avatar/></View> shows no ring: in the default layout (lib/std/ui.ts) a border takes no layout space, so the child covers it (padding insets correctly; the rn layout engine already counts borders, ui.ts line ~3671). CSS border-box and Yoga both inset content by the border.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A View's border insets its content like padding in the default layout: a View sized by its children grows by its border widths, and children of a fixed-size View are placed inside the border (border-box; box-content keeps the content size)
- [ ] #2 Per-side borders (border-t/r/b/l) inset their own side
- [ ] #3 Same frame on the interpreter, AOT and QuickJS; a golden of a ring (rounded-full border-2 around an avatar) and of a fixed-size bordered box
- [ ] #4 The goldens that change are reviewed frame by frame and re-recorded only where the old frame drew children over the border; the demos keep their look
- [ ] #5 examples/discord shows the green speaking ring around a speaker's avatar
<!-- AC:END -->
