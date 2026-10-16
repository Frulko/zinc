---
id: ZN-628
title: 'Plugins on ios and android: static linking, manifest targets, permissions'
status: Backlog
assignee: []
created_date: '2026-10-10 14:07'
updated_date: '2026-10-16 20:30'
labels:
  - mobile
  - size-L
milestone: m-26
dependencies:
  - ZN-622
  - ZN-624
ordinal: 204000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`ios` and `android` entries in `plugin.json`; the generators link the archives and merge permissions and frameworks; sqlite and video first; `webview` on WKWebView for iOS and the Android WebView; `system` reduced to what exists (clipboard, opener, deep links, notifications) (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a program using `zinc:sqlite` runs on both
- [ ] #2 a plugin without an entry for the target is refused at export with a message
- [ ] #3 the generated manifests list exactly the declared permissions
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-16 (owner, native fidelity, ../docs/reports/native-fidelity-and-plugins.md §4.4, scored 65): the mobile plugin model: plugin.json android/ios entries (sources, gradle dependencies, manifest and Info.plist fragments, entitlements) merged by zinc export into the generated projects (as Expo config plugins and CNG); zinc native-gen --android/--ios writes Java-interface and ObjC-protocol glue from the plugin's spec.ts, authors write Kotlin or Swift behind it; lifecycle subscribers in the generated activity and app delegate; zinc:system gets ios and android backends (notifications, share sheet, pickers, haptics, opener, deep links) on its op table (tools/system-ops emits their dispatch stubs).
<!-- SECTION:NOTES:END -->
