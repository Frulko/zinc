---
id: ZN-647
title: 'Guide: where a built program finds its assets'
status: Done
assignee: []
created_date: '2026-10-10 17:18'
updated_date: '2026-10-10 21:26'
labels:
  - docs
  - size-S
milestone: m-19
dependencies: []
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/guide/01, 03 and 07 still say assets are compiled into the executable (the prototype's behaviour). On Zinc Next a built program reads ZINC_ASSETS, then assets/ beside the executable, then one level above it, then the start directory (ZN-314, D66); zinc export copies the directory beside the executable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the three guide pages describe the lookup order of D66 and what zinc export ships
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: docs/guide/01 (project tree, zinc.json assets row), 03 (images baked, files read at run time) and 07 (new section 'Assets of a built program': images and fonts baked; the files read at run time from ZINC_ASSETS, assets/ beside the executable, the .app's Contents/Resources/assets, one level above, the start directory unless permissions are enforced; what zinc export ships; read needs no permission, write needs fs:write) replace the prototype's 'embedded in the executable'. Checked against runtime/include/zrt_assets_dir.h, src/host/sys_host.cpp assetsDir and src/cli_core.cpp export. usage: n/a
<!-- SECTION:NOTES:END -->
