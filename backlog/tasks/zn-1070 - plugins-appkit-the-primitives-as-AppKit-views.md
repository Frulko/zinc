---
id: ZN-1070
title: 'plugins/appkit: the primitives as AppKit views'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-08 21:43'
updated_date: '2026-11-09 01:57'
labels:
  - ui
  - appkit
  - plugins
  - size-L
milestone: m-31
dependencies:
  - ZN-1069
ordinal: 8010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
View (flattened when layout-only), Text, Image, ScrollView, TextInput and TextArea, Pressable as AppKit views; events back through the host functions; system colours and dark mode; a tree dump for tests. Report: docs/reports/appkit-native-ui-research.md, D210.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A program using View, Text, Image, ScrollView, TextInput and Pressable shows real NSViews under render native on macOS
- [x] #2 Clicks, text input and scrolling come back as the same events the drawn UI gives
- [x] #3 Dark mode and system colours follow the system setting
- [x] #4 zinc can dump the native tree; a T0 test checks the dump of a small program
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Web search (sonnet, 2026-11-09): react-native-macos wants custom NSViews flipped (isFlipped YES) and sets frames from Yoga, parent-relative (https://github.com/microsoft/react-native-macos/blob/main/docs/WritingNativeComponents.md); AppKit resets layer.transform, so Fabric macOS uses transform3D (https://github.com/microsoft/react-native-macos/pull/2866). Fabric measures text with NSTextStorage/NSLayoutManager; measuring and showing with the same cell avoids wrap mismatches. NSColor.CGColor is a snapshot: resolve in updateLayer/viewDidChangeEffectiveAppearance or performAsCurrentDrawingAppearance (https://christiantietze.de/posts/2021/10/nscolor-performAsCurrentDrawingAppearance-resolve-current-appearance/, https://nonstrict.eu/wwdcindex/wwdc2018/218/). View flattening: layout-only views get no host view, children re-parented with summed offsets (https://reactnative.dev/architecture/view-flattening). Chromium's AppKit tests start NSApplication before making views (https://chromium.googlesource.com/codesearch/chromium/src/+/HEAD/ui/base/test/cocoa_helper.mm).

Done:
- plugins/appkit (zinc:appkit): plugin.json (macos impl native/appkit.macos.mm, ARC; a stand-in elsewhere), spec (start, commit, dump, snapshot, hit, drive, onEvent), index.ts installs the host on import when ui.nativeRender(). docs/plugins/appkit.md, docs/ui.md Native views.
- Views: View/Button/Pressable as flipped ZnView drawing bg, radius, border in drawRect (no layers: dynamic colours resolve in drawing, cacheDisplayInRect snapshots work); layout-only views flattened (no NSView, offsets summed); Text as a wrapping NSTextField label; Image as NSImageView from the project's assets; ScrollView as NSScrollView with a flipped document, scrollers only on the axes whose content is larger; TextInput as NSTextField/NSSecureTextField (rounded bezel); TextArea as NSTextView in a scroll view. Root ZnRoot over SDL's content view, letterboxed like the renderer, windowBackgroundColor; headless: a borderless window never shown, NSApp with the Prohibited policy.
- Events: presses, hover and drags fall through (hitTest returns nil on our non-input views) to SDL's view, so zinc:ui hit-tests and fires onClick as drawn. Fields and text views report edit/change/submit/focus/blur, scroll views their offset; queued with (handle, generation) and delivered by a zrt::Poller; a d record drops the slot's queued events; index.ts also checks ui.hostMounted (a recycled handle never takes a stale event).
- Measure: AppKit cells measure text (wrapping label cellSizeForBounds) and fields through zn_host_set_native_measure (C entry point in src/host/layout_yoga.cpp: zinc does not export its C++), looked up with dlsym so a program without Yoga runs.
- Engine (commit 1): host buffer carries field value/image asset (t), placeholder (a), secure (p), focus (o ID); ui.hostMounted; no SDL text input under a host and native-field keys go to the program's key handlers only (SDL3 reports every key even when an NSTextField is first responder); render native defaults the layout to rn; ZINC_RENDER applies at compile time (and is in the program cache signature); HOST_DEFAULTS follow BORDER_DEFAULT/DEFAULT_TEXT.
- Dark mode: system colours (labelColor, windowBackgroundColor, text field and text view colours) follow the appearance live; explicit colours stay. ZINC_APPEARANCE=dark|light forces one for a run (screenshots).
- T0 tests/t0/ui_appkit.sh + tests/golden/ui-appkit: headless dump of the tree, a press through to zinc:ui, typing/Enter/scroll driven through AppKit, an update and a recycled handle; interpreter golden, QuickJS and AOT identical (3 s cached). tests/run --only ui_native_host still passes.
- Proof: headless run on the three engines identical; a windowed run (ZINC_BACKGROUND=1) showed the real NSViews in the SDL window (screencapture of the window), light and dark snapshots.

Decisions (for the coordinator to record under D210/D225):
- The host is installed by importing zinc:appkit (React Native macOS needs its package too): no engine magic per engine or bundle, drawn programs and other targets untouched; a program without the import is drawn.
- Presses are not taken by the views: they fall through to SDL so zinc:ui's own hit testing gives exactly the drawn UI's events (press states, gestures, long press). Only views that edit or scroll take input.
- Views draw their own background/border in drawRect instead of CALayer properties: system colours resolve per appearance without performAsCurrentDrawingAppearance, and snapshots work offscreen.
- The plugin reaches the layout's native measure through an exported C function (zn_host_set_native_measure) found by dlsym, since zinc does not export zn:: symbols (tools/zinc-unexported.txt).
- A native render lays out with Yoga by default (as React Native): only rn leaves are natively measured.

later.md lines:
- ZN-1070: Text spans (nested Text with their own styles) show as one string in one style; build an NSAttributedString from the runs.
- ZN-1070: WrapStyle carries no weight: a bold text is measured regular until its first commit told the host it is bold; pass the weight to the native measure.
- ZN-1070: a scroll position set by the program (scrollTo) is not in the host buffer; add scroll records.
- ZN-1070: shadows, clipping (overflow-hidden), transforms and the pressed dim are not shown by the AppKit host.
- ZN-1070: the AppKit host walks the whole tree each commit (views touched only where something differs); make it incremental if ZN-1074's measures ask.
- ZN-1070: a scroll view's content size is the union of its children's boxes (no content padding); send zinc:ui's content size in the buffer.
- ZN-1070: zinc check could note a render native project that never imports zinc:appkit (it is drawn).
- ZN-1070: plugins/appkit has no web entry: a render native project exported to the web should skip it.

Proposed tests:
- tests/run --only ui_appkit (3 s cached, 20 s cold with the AOT compile and the plugin build; 300 MB): already run here, passes.
- tests/run --only ui_native_host (15 s, 300 MB): already run here, passes.
- tests/run --only ui_dts (tsc, 20 s): lib/ui.d.ts has hostMounted.
- By hand on the Mac: typing with a Japanese input method in a zinc:appkit field (marked text) and switching the system appearance while an app runs.
<!-- SECTION:NOTES:END -->
