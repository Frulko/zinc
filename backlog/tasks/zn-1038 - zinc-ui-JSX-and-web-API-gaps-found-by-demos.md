---
id: ZN-1038
title: 'zinc:ui, JSX and web API gaps found by demos'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:38'
updated_date: '2026-11-08 21:07'
labels:
  - ui
  - size-M
milestone: m-5
dependencies: []
ordinal: 4500
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
- [x] #1 A w-full max-w-[440px] child of an items-center parent is centred
- [x] #2 JSX helper returning JSX is lowered whatever its name; icon names inside expressions are picked up or warned
- [x] #3 getUserMedia requests camera permission first; QuickJS loads native/<name>.sim.ts stand-ins; a missing asset font leaves no pending fs error
- [x] #4 Webcam photos taken in one second sort in order after a restart
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worker branch, 2026-11-08).
Research: CSS Box Alignment (https://www.w3.org/TR/css-align-3/#align-items-property) and Yoga centre a max-width-clamped w-full child; Chrome asks for the camera on getUserMedia (https://developer.mozilla.org/docs/Web/API/MediaDevices/getUserMedia).
Found already fixed on develop (reproduced, now under test): the w-full max-w-[440px] child of items-center is centred (interpreter and QuickJS, 180 of 800 px); icon names inside expressions are scanned (modules.cpp dyn regex) and a name not compiled in warns U0001 at run time; loadFont on a missing asset leaves no pending fs error (zn_asset_font clears gFailed; interpreter and QuickJS). The webcam demo's workarounds are gone: Notice is w-full max-w-[440px], the helper renderKids is now kids.
Fixed: JSX lowering (src/frontend/jsx.cpp) mounts a call that makes a node: a call handed the children (helper(p.children)), handed a render arrow (wrap(() => <X/>)), ui.createNode(...), a helper whose return is a parameter typed () => i32 or a node variable, found in two passes, and a class field holding a component ({obj.f()}, ZN-844). QuickJS (src/qjs/qjs.cpp normalizeName) resolves native/x.spec to x.next.ts or x.sim.ts under ZINC_NATIVE=sim. zinc:camera and zinc:microphone getUserMedia bridges call requestPermission() when the status is undetermined. Webcam photos sort by stem, newest first.
Decision: no diagnostic for {f()} where f is an unknown () => i32 (a Solid accessor of a number has the same type): only the cases above are recognised syntactically; <F /> stays the spelling for a component in a variable.
Not done (not a criterion): Lumen box shadow under translucent backgrounds (clip the shadow to the outside of its box).
Proof: tests/t0/demo_gaps.sh passes (interpreter, QuickJS, QuickJS sim camera); jsx, jsx_banned, jsx_gaps, jsx_list_branch, jsx_map_named, jsx_narrow, jsx_null_component, jsx_project_model, jsx_react_narrow, jsx_style, solid_index, ui_say_what, webcam_sim pass; zinc check of every example and app: only the 3 failures already on develop (esp32-espnow, esp32-wifi, notify-relay). Webcam denied screen looked at, 390x844 and 1040x680: centred, children shown.
Proposed tests: tests/t1/webcam_demo.sh (frames should not move), tests/t1/webcam.sh with a real camera on a Mac where access was never given (the question shows), the iPod demo with ZINC_NATIVE=sim --engine quickjs, full T1 for the JSX lowering change.
<!-- SECTION:NOTES:END -->
