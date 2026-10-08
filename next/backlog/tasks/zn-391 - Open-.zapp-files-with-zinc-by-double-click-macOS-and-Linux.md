---
id: ZN-391
title: Open .zapp files with zinc by double-click (macOS and Linux)
status: Backlog
assignee: []
created_date: '2026-10-08 23:55'
labels:
  - distribution
  - size-S
dependencies: []
ordinal: 158000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up of ZN-318: zinc run app.zapp works; the desktop does not know the type yet. macOS: a UTI (dev.zinc.zapp, conforms to public.data) and CFBundleDocumentTypes in zinc's own app bundle, the open-file event passed to zinc run. Linux: a shared-mime-info XML (application/x-zinc-app, glob *.zapp) and a .desktop entry with Exec=zinc run %f, installed by zinc's package.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 on macOS, LaunchServices maps .zapp to zinc and an open event runs the archive (test with the open-file event); on Linux the mime XML and .desktop file validate (desktop-file-validate, xmllint) and map *.zapp
<!-- AC:END -->
