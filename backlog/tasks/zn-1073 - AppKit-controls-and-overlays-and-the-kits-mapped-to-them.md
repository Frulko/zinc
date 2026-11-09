---
id: ZN-1073
title: 'AppKit controls and overlays, and the kits mapped to them'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-08 21:44'
updated_date: '2026-11-09 03:12'
labels:
  - ui
  - appkit
  - size-M
milestone: m-31
dependencies:
  - ZN-1070
ordinal: 8040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PushButton, PopUpButton, SegmentedControl, Switch, Checkbox, Slider, DatePicker, SearchField, Progress, Popover, Sheet, Alert; the kits and zinc:react-native map their components to them under the native renderer. Report: docs/reports/appkit-native-ui-research.md, D210.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each control is a typed zinc:appkit component with a drawn fallback
- [x] #2 Under render native, the kit's Button, Switch, Select and Slider and the matching zinc:react-native components become the AppKit controls
- [x] #3 Popover, Sheet and Alert open and close and return their result
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worktree agent, 2026-11-09).

Research (sonnet sub-agent, short):
- NSAlert `runModal` is application-modal and blocks; `beginSheetModalForWindow:completionHandler:` returns at once and gives the same codes in the block (https://lists.apple.com/archives/cocoa-dev/2005/Mar/msg01688.html). Timers of the default mode stop during a modal session (https://lists.apple.com/archives/cocoa-dev/2004/Mar/msg00439.html); a runModal before NSApp's loop runs can leave invisible windows (https://bugzilla.mozilla.org/show_bug.cgi?id=1726833). SDL's own Cocoa message box pumps SDL_PumpEvents while its sheet is up (https://hg.libsdl.org/SDL/file/681eb46b8ac4/src/video/cocoa/SDL_cocoamessagebox.m), so sheets work under SDL's pump.
- NSPopover: transient closes on most interactions, semitransient only on its window's; showing from a view with no window raises (https://developer.apple.com/forums/thread/126081); close it before tearing the window down (https://stackoverflow.com/questions/28520714). Header: NSPopover.h behaviours.
- React Native macOS keeps the RN components (RCTSwitch, RCTSlider) and does not try to expose every control (https://github.com/microsoft/react-native-macos/wiki/Scope-of-react-native-macos).

What was built:
- zinc:appkit controls: PushButton, Switch, Checkbox, PopUpButton, SegmentedControl, Slider, DatePicker, SearchField, Progress; each a zinc:ui node with a native kind (pushbutton, switch, checkbox, popup, segmented, slider, datepicker, search, progress) and string attributes, its drawn fallback the same node. PushButton, Switch, Slider, SegmentedControl and Progress are the kit's Button, Switch, Slider, Tabs and Progress.
- The kits map themselves with one hook, `nativeControl(node, kind, attrs, onValue)` in lib/std/kit/host.ts (exported by zinc:ui/kit): kit Button (label only), Switch (its track), Slider, Tabs, Progress; nuxt Button (label only), Switch (track), Checkbox (its box), Select (its trigger); zinc:react-native Button and Switch. Drawn it returns at once. Core addition: `ui.onNativeValue(h, f)` / `ui.nativeValue(h, v)` (one field in Handlers), declared in lib/ui.d.ts and docs/ui.md.
- Host (appkit.macos.mm): NSButton (rounded, keyEquivalent), NSSwitch (a check box before 10.15), NSButton check box, NSPopUpButton, NSSegmentedControl, continuous NSSlider snapped to step, NSDatePicker (UTC, yyyy-MM-dd), NSSearchField (a field: domEdit, plus the clear button through its action), NSProgressIndicator. Their own event kinds: 15 press (ui.click), 16 value (ui.nativeValue), 17 overlay closed; list events are routed only for kinds 8 to 14. Controlled: a poll after a value event the control shows its attribute again, so a refused value goes back (the golden's "locked" switch).
- Overlays: `alert(o): Promise<number>` (zinc:system's message convention: button index, -1 dismissed), `sheet(content): Promise<string>`, `popover(anchor, content, {edge}): Promise<string>`. Each a zinc:ui layer whose panel has the native kind; native: NSAlert beginSheetModalForWindow, a window run with beginSheet (Escape = cancelOperation), a transient NSPopover at the anchor's box; never runModal. Headless (window not visible) they are built, not presented. `appkit.overlays()` test hook; drive actions 10 (click), 11 (set value), 12 (end an overlay).

Proof:
- tests/t0/ui_appkit_controls.sh (new, golden tests/golden/ui-appkit-controls): interpreter = golden, QuickJS and AOT = interpreter, drawn fallback lines. PASS. ui_appkit, ui_appkit_chrome, ui_appkit_table, kit_input, nuxt_theme, rn_layer_gaps: PASS.
- A scratch React program (zinc:react-native Button and Switch, nuxt Switch, Select, Checkbox, Button) under render native: all six become AppKit controls and their events reach the program, on the interpreter, QuickJS and the AOT.
- One background windowed run (ZINC_BACKGROUND=1, visible window): popover, alert and sheets shown for real ("shown"), a click in the popover, an alert button, a sheet's Done and Escape resolve their promises, and the frames went on throughout.
- Snapshot looked at: real NSButton, NSSwitch, check box, pop-up, segmented control, slider, date picker, search field and progress bar.
- The .mm compiles clean with -Wall -Wextra.

Proposed tests:
- tests/t0/ui_appkit_controls.sh (written, passing): the controls and overlays on three engines and the drawn fallback; about 1 min, under 400 MB.
- A windowed macOS test (background, alone): the overlays presented for real on a visible window and ended through AppKit, the frames going on; about 10 s, about 250 MB.
- A golden of the kits under the host (React: zinc:react-native Button and Switch, nuxt Switch, Select, Checkbox, Button) on three engines; about 1 min, under 400 MB.
- On the Mojave Mac: Switch falls back to a check box on 10.14; one short run, under 300 MB.
<!-- SECTION:NOTES:END -->
