---
id: ZN-1071
title: 'AppKit window chrome: Window, Toolbar, SplitView and Sidebar'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-08 21:43'
updated_date: '2026-11-09 02:25'
labels:
  - ui
  - appkit
  - desktop
  - size-M
milestone: m-31
dependencies:
  - ZN-1070
ordinal: 8020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the window's content under SDL (keys, first responder, Tab loop); zinc:appkit Window, Toolbar, SplitView with Sidebar; nested Yoga roots that follow native pane and item sizes. Report: docs/reports/appkit-native-ui-research.md, D210.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc:appkit exports Window, Toolbar, SplitView and Sidebar with typed props, each with a drawn fallback where no native host runs
- [x] #2 Tab and Shift-Tab move the first responder through the controls; keys reach the focused view
- [x] #3 Resizing a split pane re-lays out its Yoga subtree
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Web search (sonnet, 2026-11-09): React Native macOS added a nextKeyViewTag prop for the key view loop and reverted it (#769, #1621: https://source-hub.etos-pro.ru/microsoft/react-native-macos/commit/1fc2d1d999f6a3899c7e76700af3a823d102ef56), and makes acceptsFirstResponder follow `focusable` only (https://github.com/microsoft/react-native-macos/pull/1437): so the focus order stays the framework's, not a hand-wired nextKeyView chain. SDL3 reads every key event in its NSApp sendEvent (Cocoa_HandleKeyEvent) whatever the first responder, and a field editor would also act on Tab (selectNextKeyView); unhandled keys walk to the window and beep (https://git.huazai-net.workers.dev/RustAudio/baseview/pull/226). Sidebar recipe: NSSplitViewItem sidebarWithViewController, unified toolbar, sidebar material (WWDC20 10104, https://www.wwdcnotes.com/notes/wwdc20/10104); macOS 26 makes the sidebar a glass pane and asks apps to drop their own NSVisualEffectView (WWDC25 310, https://developer.apple.com/videos/play/wwdc2025/310/). Electron/Tauri expose titleBarStyle hiddenInset, trafficLightPosition, vibrancy 'sidebar' and no native toolbar (https://www.electronjs.org/docs/latest/api/structures/base-window-options). NSToolbar on SDL's NSWindow works as on any window with a retained delegate.

Done:
- zinc:appkit exports Window (title, toolbarStyle, fullSizeContent), Toolbar, ToolbarItem (label, SF Symbol, onPress, or custom children), SplitView and Sidebar (width, minWidth, maxWidth), typed function components in plugins/appkit/index.ts. Each is a zinc:ui node with a native kind; drawn (ZINC_RENDER=drawn, no host, other targets) the same nodes draw a window column, a top bar, buttons with labels, a row and a grey bordered column; the title goes through gfx.windowCtl.
- Engine (lib/std/ui.ts host section): ui.setNativeKind(h, kind) (sent as `c ID KIND`; a kind change is sent as delete then create) and ui.setNativeAttr(h, name, value) (`a ID NAME TEXT`), a UiNode field pair nk/nkv; HOST_PROPS gains `focusable`; the focus record is `o ID K` (K 1 when the keyboard moved the focus); hostKey: while a native field has the focus, a Tab or Shift-Tab the program's handlers leave goes to zinc:ui's focusStep (the HAL key loop and the ui.keyDown test hook share it). lib/ui.d.ts declares both new functions.
- Engine gap fixed: under the rn (Yoga) layout `flex-1` did not shrink (shrink -1 became Yoga's 0), so a pane next to a widened sidebar ran past the window; flex-1 now sends shrink 1, as the classic layout and React Native's flex: 1 do (basis stays auto).
- Host (appkit.macos.mm): Window sets the window's title, toolbar style and full-size content; Toolbar builds an NSToolbar (ZnToolbar delegate; ids carry the handle's generation, rebuilt when the items change, updated in place otherwise), a custom item shows its node's view with width/height constraints from the Yoga box; presses come back as EvPress -> ui.click. SplitView is an NSSplitView (thin divider, vertical) whose panes are always real views at zinc:ui's boxes; the divider is hit-tested itself (presses elsewhere fall through to SDL) and dragged with mouseDown/mouseDragged, not AppKit's tracking loop (which would hold SDL's pump and zinc:ui's frames); the sidebar holds its width on window resizes (shouldAdjustSizeOfSubview), min/max from the Sidebar's attributes; splitViewDidResizeSubviews outside a commit (CommitScope RAII guard) reports the first pane's width -> ui.setNumber(width) -> Yoga lays both subtrees out again. Sidebar is an NSVisualEffectView with the sidebar material.
- Keyboard: the fields' delegate swallows insertTab:/insertBacktab: so Tab stays zinc:ui's; focusable views are real ZnViews (no longer flattened) that accept the first responder, draw the system focus ring mask and swallow keys (no beep: SDL already has them); moveFocus gives the keys back to SDL's view instead of nil.
- Headless window is now titled (never shown), so title and toolbar have a window; ZINC_APPEARANCE also sets the window's appearance (the chrome follows).
- T0 tests/t0/ui_appkit_chrome.sh + tests/golden/ui-appkit-chrome: dump of window/toolbar/split/sidebar, field-editor Tab ignored, Tab/Shift-Tab through two fields and a focusable view (`first` in the dump), keys to the focused node's onKeyDown, Enter on the focused view, toolbar press, divider to 140 (both subtrees re-laid: content 179 wide) and clamped at maxWidth 160; interpreter golden, QuickJS and AOT identical, drawn fallback line. ui_appkit golden updated (the Pressable is now a focusable view). tests/run --only ui_appkit, ui_appkit_chrome, ui_native_host pass.
- Proof: windowed run (ZINC_BACKGROUND=1) of a Solid TSX app (Window, Toolbar with a symbol item and a search field, SplitView, Sidebar, fields, a button): real unified toolbar with SF Symbol and field, title, sidebar, divider, light and dark (window screencapture); fullSizeContent puts the content under the title bar.

Decisions (for the coordinator, under D210/D228):
- The window chrome components are zinc:ui nodes with a native kind and string attributes (setNativeKind/setNativeAttr), not new tags: the drawn fallback is the same node with classes, the contract grows by two fields and no target name enters the core.
- One Yoga tree, not nested roots: split panes are laid out by zinc:ui at their boxes and the native split view only reports the divider (the first pane's width), which zinc:ui applies as a style width; toolbar custom items take their Yoga size through constraints. Nested roots are not needed while AppKit never sizes a pane on its own (it does not: shouldAdjustSizeOfSubview keeps the sidebar, the commit sets every frame).
- The keyboard focus stays zinc:ui's (tree order, tabIndex, focus scopes): native fields leave Tab to it and the host follows `o` records; no nextKeyView chain (React Native macOS reverted theirs).
- Focusable views are not flattened (React Native does not flatten focusable or accessible views): they take the first responder and the system focus ring when the keyboard put the focus there.
- The divider drag runs on mouseDragged events, not NSSplitView's modal tracking loop, so zinc:ui keeps its frames during the drag.
- Under the rn layout flex-1 shrinks (flex: 1 1 auto), as in the classic layout and RN; flex-basis 0 is left for later.

later.md lines:
- ZN-1071: rn layout: flex-1 still has basis auto (Tailwind and RN's flex: 1 have basis 0%): two flex-1 siblings split the room by content, not equally.
- ZN-1071: Sidebar collapse (NSSplitView collapsing, a toggle item), toolbar spacers (flexible space) and the sidebar tracking separator.
- ZN-1071: macOS 26 draws the sidebar as a glass pane: drop the NSVisualEffectView there (WWDC25 310) and check fullSizeContent with it.
- ZN-1071: Window is the main window only; more windows come with zinc:system/window under the host.
- ZN-1071: fullSizeContent: hide the title (titleVisibility) and give the program the title bar's height to pad with (an env inset).
- ZN-1071: SplitView supports a sidebar first and side-by-side panes only; vertical splits and a trailing inspector pane.
- ZN-1071: components read their props once: a reactive title or label in the Solid model needs the component rebuilt; make Window/ToolbarItem attributes follow signals.

Proposed tests:
- tests/run --only ui_appkit_chrome (4 s cached, about 30 s cold with the AOT compile; 300 MB): already run here, passes.
- tests/run --only ui_appkit and --only ui_native_host (3 s and 15 s, 300 MB): run here, pass.
- The rn-layout goldens of T1 (react-native*, rn-port, rn-showcase sessions; minutes, 500 MB): flex-1 now shrinks under rn, a frame where a flex-1 child overflowed its parent changes.
- By hand on the Mac (ZINC_BACKGROUND=0): drag the split divider with the mouse (cursor, live re-layout, min/max), Tab and Shift-Tab with the real keyboard through the fields and the focus ring on a Pressable, the toolbar search field typing (1 minute, 300 MB).
<!-- SECTION:NOTES:END -->
