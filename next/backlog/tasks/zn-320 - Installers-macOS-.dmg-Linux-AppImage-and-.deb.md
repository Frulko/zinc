---
id: ZN-320
title: 'Installers: macOS .dmg, Linux AppImage and .deb'
status: Backlog
assignee: []
created_date: '2026-10-08 14:19'
labels:
  - packaging
  - desktop
  - size-M
milestone: m-19
dependencies: []
ordinal: 55050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`zinc export --target macos --dmg` (hdiutil, background and Applications link), `--target linux --appimage` (pinned appimagetool or our own squashfs writer) and `--deb` (written directly: ar + tar, no dpkg needed), with the icon, the .desktop file and the version of zinc.json.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the .dmg mounts and holds the signed .app
- [ ] #2 the AppImage runs in the Linux container; the .deb installs with dpkg -i in the container and its files are listed
- [ ] #3 every installer is reproducible (same bytes twice) except for signatures
<!-- AC:END -->
