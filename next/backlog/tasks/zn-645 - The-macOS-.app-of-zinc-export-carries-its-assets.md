---
id: ZN-645
title: The macOS .app of zinc export carries its assets
status: Backlog
assignee: []
created_date: '2026-10-10 17:18'
labels:
  - packaging
  - macos
  - size-S
milestone: m-19
dependencies: []
ordinal: 120900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-314 (D66): the .app written by zinc export holds only the executable; the assets stay in dist/<name>-macos/assets, so the app started from Finder or moved elsewhere finds none. Copy them into Contents/Resources/assets before codesign (tc/bundle.cpp writeBundle) and add <exe dir>/../Resources/assets to assetsDir() (next/src/host/sys_host.cpp). plugins/webview/src/webview.mm reads getenv("ZINC_ASSETS") itself for zinc:// URLs: route it through the same function.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 an exported .app that reads an asset, moved to another directory and started, prints it
- [ ] #2 codesign --verify passes on the bundle
- [ ] #3 a built webview app serves a zinc:// asset from the same directory
<!-- AC:END -->
