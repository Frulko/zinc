---
id: ZN-1038
title: 'zinc:ui, JSX and web API gaps found by demos'
status: Backlog
assignee: []
created_date: '2026-11-07 16:38'
labels:
  - ui
  - size-M
milestone: m-5
dependencies: []
ordinal: 4500
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gaps that hide content or break layout silently.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-857: `ZINC_NATIVE=sim` with `--engine quickjs` does not use a plugin's stand-in (the iPod demo stops on "/Volumes/ZINCPOD does not exist"); make QuickJS load `native/<name>.sim.ts` as the other engines do.
- ZN-650.14: `gfx.loadFont` on a missing asset file leaves its fs error pending and the next zinc:assets call throws it; fix in `zn_asset_font`.
- ZN-: getUserMedia never asks for the camera (unlike a browser): on a Mac where access was never given it fails with NotAllowedError; it should call requestPermission first.
- ZN-: zinc:ui layout: a `w-full max-w-[440px]` child of an `items-center` parent is placed left, not centred (CSS and Yoga centre it).
- ZN-: JSX lowering prints `{helper(p.children)}` as text unless the helper is named `render*` or returns JSX directly; content silently disappears.
- ZN-: webcam demo: photos taken in the same second get a `-2` suffix that sorts before the first name, so the strip order is off after a restart.
- ZN-911: an icon name written inside an expression (`<Icon name={on ? 'a' : 'b'}>`) is not picked up from the sources, so the icon draws nothing unless it is in `zinc.json` "icons"; scan the string literals of the expression or warn.
- ZN-844: compiler: in JSX, `{f()}` where `f: () => i32` is a component held in a variable or a field renders the element's handle as text ("98"), silently; `<F />` works. Either mount it or refuse it with a diagnostic (found in zinc:remarkable RemarkableApp).
- Lumen: a box's `shadow-*` is painted under its whole box, so it shows through a translucent background; CSS clips it to the outside. Lumen's glass cards have no shadow because of it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A w-full max-w-[440px] child of an items-center parent is centred
- [ ] #2 JSX helper returning JSX is lowered whatever its name; icon names inside expressions are picked up or warned
- [ ] #3 getUserMedia requests camera permission first; QuickJS loads native/<name>.sim.ts stand-ins; a missing asset font leaves no pending fs error
- [ ] #4 Webcam photos taken in one second sort in order after a restart
<!-- AC:END -->
