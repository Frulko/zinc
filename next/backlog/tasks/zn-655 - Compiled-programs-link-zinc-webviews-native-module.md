---
id: ZN-655
title: 'Compiled programs link zinc:webview''s native module'
status: Backlog
assignee: []
created_date: '2026-10-10 18:15'
labels:
  - packaging
  - macos
  - webview
  - size-M
milestone: m-19
dependencies:
  - ZN-645
ordinal: 401410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-645: zinc build of examples/webview/hybrid links no zinc:webview code (no zn_module_*, no WKWebView, no WebKit in otool -L): the built program does not register the plugin's native module, so a built app has no real web view and its zinc:// pages are never served. Interpreted runs load the plugin (its library builds and loads). Find why mod.natives has no webview entry in AOT builds (the plugin's natives come from native/webview.spec.ts, the macOS code is src/webview.mm listed in plugin.json sources) and link it like the other module plugins (sqlite, process). Then prove ZN-645's last criterion: a built webview app serves a zinc:// asset from its own assets/ (beside it or in its .app's Resources: runtime/include/zrt_assets_dir.h).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc build of a zinc:webview program links the plugin (its module registers; WebKit linked)
- [ ] #2 a built webview app serves a zinc:// asset from its .app's Resources/assets (a page that posts the asset's text back, checked by the program)
<!-- AC:END -->
