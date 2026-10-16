---
id: ZN-749
title: 'NativeView: a real native view at a layout rectangle (web view first)'
status: Backlog
assignee: []
created_date: '2026-10-16 20:29'
labels:
  - mobile
  - ui
  - size-M
milestone: m-26
dependencies:
  - ZN-628
ordinal: 201500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-16 (../docs/reports/native-fidelity-and-plugins.md §4.3, scored 66 against split layers 50 and textures 40): a <NativeView> zinc:ui leaf whose rectangle, clip and visibility the host forwards to a native view laid over the Zinc surface (NSView / UIView subview, an Android view over SDL's SurfaceView), hidden or snapshotted when a Zinc overlay covers it; what Flutter's platform views and React Native's native components do for maps, web views, video and ads. Port plugins/webview (examples/webview/hybrid, WKWebView over the surface on macOS) to it, then Android WebView and iOS WKWebView.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/webview/hybrid runs on macOS through NativeView unchanged in behaviour (its test)
- [ ] #2 the same page in a NativeView on the Nexus 7 and the iOS simulator, scrolling with the Zinc page and clipped by it
- [ ] #3 a decision record: the compositing rule and the cost measured
<!-- AC:END -->
