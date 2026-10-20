---
id: ZN-645
title: The macOS .app of zinc export carries its assets
status: Done
assignee: []
created_date: '2026-10-10 17:18'
updated_date: '2026-10-10 18:15'
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
- [x] #1 an exported .app that reads an asset, moved to another directory and started, prints it
- [x] #2 codesign --verify passes on the bundle
- [ ] #3 a built webview app serves a zinc:// asset from the same directory
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10. writeBundle (src/tc/bundle.cpp) copies the project's assets/ (BundleSpec.assets, set by bundleSpecOf) into Contents/Resources/assets before codesign; the lookup of a built program's assets moved to runtime/include/zrt_assets_dir.h (beside the executable, the bundle's Resources, one level above; the working directory when the caller allows it), used by the host's assetsDir() (src/host/sys_host.cpp) and by zinc:webview's zinc:// URLs (plugins/webview/src/webview.mm, after ZINC_ASSETS; no working directory there): a header, not a host function, because the prototype also compiles webview.mm. tests/t1/aot_assets.sh: an exported .app moved out of dist/ and started from / prints its asset ("bundled"), codesign --verify --strict passes: PASS. The webview plugin builds with the change (interpreted run of examples/webview/hybrid).
AC3 not done: a built zinc:webview program links no webview code at all (no native module registered, no WebKit), a gap older than this task: ZN-655, which carries the zinc:// check.
usage: n/a
<!-- SECTION:NOTES:END -->
