---
id: ZN-320
title: 'Installers: macOS .dmg, Linux AppImage and .deb'
status: Done
assignee: []
created_date: '2026-10-08 14:19'
updated_date: '2026-10-25 01:53'
labels:
  - distribution
  - size-M
  - parked
milestone: m-19
dependencies: []
ordinal: 296000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`zinc export --target macos --dmg` (hdiutil, background and Applications link), `--target linux --appimage` (pinned appimagetool or our own squashfs writer) and `--deb` (written directly: ar + tar, no dpkg needed), with the icon, the .desktop file and the version of zinc.json.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the .dmg mounts and holds the signed .app
- [ ] #2 the AppImage runs in the Linux container; the .deb installs with dpkg -i in the container and its files are listed
- [ ] #3 every installer is reproducible (same bytes twice) except for signatures
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ZN-320.01 (.deb, reproducible, written without dpkg) and ZN-320.02 (.dmg with the signed .app) done; ZN-320.03 (AppImage) parked by D39 until a Linux runner exists, with ZN-393 (dpkg -i in a container). AC #3: the .deb and the .app are byte-reproducible; hdiutil stamps the .dmg (UUID, times), noted in docs/guide/07-distribution.md.

Closed by the backlog review of 2026-10-10 (docs/reports/backlog-review-2026-10-10.md), with the owner's approval: Parent whose parts are done (.01 .deb, .02 .dmg) or parked on their own (.03 AppImage, ZN-393). Its parked label blocks ZN-321 (signing) and ZN-325 (publish), both Mac work: close it.
Review 2026-10-25: the open criteria are moot. Needs a Linux runner; tracked by ZN-393. .dmg is stamped by hdiutil, documented in docs/guide/07-distribution.md.
<!-- SECTION:NOTES:END -->
