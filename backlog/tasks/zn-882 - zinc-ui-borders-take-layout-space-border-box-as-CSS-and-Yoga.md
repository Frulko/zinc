---
id: ZN-882
title: 'zinc:ui: borders take layout space (border-box, as CSS and Yoga)'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 19:54'
updated_date: '2026-10-30 20:25'
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
- [x] #1 A View's border insets its content like padding in the default layout: a View sized by its children grows by its border widths, and children of a fixed-size View are placed inside the border (border-box; box-content keeps the content size)
- [x] #2 Per-side borders (border-t/r/b/l) inset their own side
- [x] #3 Same frame on the interpreter, AOT and QuickJS; a golden of a ring (rounded-full border-2 around an avatar) and of a fixed-size bordered box
- [x] #4 The goldens that change are reviewed frame by frame and re-recorded only where the old frame drew children over the border; the demos keep their look
- [x] #5 examples/discord shows the green speaking ring around a speaker's avatar
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (ZN-882): lib/std/ui.ts gets bwOf/inT/inR/inB/inL (padding + border per side, borderW -1 = 1 px, bd.bT/bR/bB/bL per side). Every layout use of the padding goes through them: measure (text, fields, boxes, scroll content, fixed sizes and flex-basis are never below padding + border), place (flow children, text re-wrap), absolute children (placed in the padding box: inside the border, CSS), text paint/selection/hit, text fields (rows, caret, clip, scroll, gutter), sticky room. box-content now adds padding and border to w/h in classic. The rn engine now sends a colour-only border (-1) to Yoga as 1 px, as it is drawn. Exposed by the change and fixed: flex-start of a reversed axis overflows at its start (Yoga); classic now passes 343 Yoga cases (was 289), classic.pass/known-fail refreshed.
Goldens re-recorded, each reviewed old vs new frame (content moved inside a 1-2 px border, nothing else): ui-grow-wrap (card labels inside their border), discord hash (headers with border-b), ui-kbd-inset, ui-kit-sections, ui-theme dark (kit cards, buttons, badges, tabs), ui-style text-shadow (bordered input), menubar light/dark (menu panel, bar border-b), tests/visual ui-1/ui-40 (card, Cancel button); scroll-end: the nested bordered scroll view ends with its last child above the 1 px bottom border (163 of 163; the test's expected end counts the border). Not re-recorded (already failing on develop): nuxt_ui, rn_showcase, platform_look hashes; reviewed nuxt-ui dashboard and rn-showcase forms: only the border inset changes.
New test: tests/t1/ui_border_box.sh (ring, fixed box, per-side, box-content; check.py probes pixels; same hash on interpreter, QuickJS, AOT). examples/discord: the speaking ring shows with no change to the app (VOICE_AVATAR 20 + border-2 = 24 in the 28 px row), seen in frames of tests/t1/discord_voice.sh.
Later: rn's border-color-only nodes now count 1 px in Yoga; discord_voice could probe the ring's pixels (it runs on real time, so a frame number is not stable).
<!-- SECTION:NOTES:END -->
