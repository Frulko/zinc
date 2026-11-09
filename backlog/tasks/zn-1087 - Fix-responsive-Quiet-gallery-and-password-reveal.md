---
id: ZN-1087
title: Fix responsive Quiet gallery and password reveal
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 14:28'
labels:
  - ui
  - demo
  - size-S
milestone: m-32
dependencies: []
type: bug
ordinal: 1008
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request2026-11-09 with screenshots: the design-pictures gallery clips its right column when the window is narrower, and the password eye is misaligned and does nothing. Exact source is docs/img/design/src, PICTURE=gallery, NOT examples/ui/kit-gallery. gallery/gallery.tsx imposes405+506+405px columns plus gaps/padding, without scrolling; gallery/left.tsx overlays a decorative RoleIcon eye on Input with no button/action. Use the existing responsive/layout primitives and newly integrated kit PasswordField; preserve the Quiet composition, light/dark and all existing picture modes. Make the actual reveal control aligned, focusable, accessible and work on pointer/keyboard; reuse the kit provider rather than another app-local implementation. If an icon reveal refinement belongs in PasswordField, only that shared provider hunk is now free (Inputs worker finished).

Owner screenshots: /Users/mowmow/Desktop/Screenshot 2026-11-09 at15.25.07.png and15.25.09.png (actual filenames have space after at). Inspect originals via view_image. Source is a documentation app, but apply zinc-app and relevant zinc-demo proof principles. No new demo suite/golden by default: owner explicitly requests this interaction, so use bounded real pointer/key/resize proof and actual captures. Any actual engine gap gets minimized, not worked around.

Primary research supplied before task: WAI button pattern https://www.w3.org/WAI/ARIA/apg/patterns/button/ for keyboard/pressed semantics; Flutter adaptive constraints https://docs.flutter.dev/ui/adaptive-responsive/general for using available space rather than physical device names. Zinc docs/design.md and existing UI responsive classes/providers are binding; no new web dependency.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PICTURE=gallery fits narrow tablet/desktop widths without horizontal clipping, scrolls to every card and responds correctly to resize; other illustration modes remain unchanged
- [ ] #2 Password reveal uses the shared kit control with centred visible affordance, real pointer and keyboard toggling, accessible name/state, preserved text/edit focus and no duplicate decorative eye
- [ ] #3 Actual bounded gallery proof and light/dark captures at representative narrow/mid/wide sizes are inspected; notes describe commands and limitations, no unnecessary new demo test suite
<!-- AC:END -->
