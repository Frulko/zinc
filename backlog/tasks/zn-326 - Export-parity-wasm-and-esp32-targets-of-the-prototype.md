---
id: ZN-326
title: 'Export parity: wasm and esp32 targets of the prototype'
status: Done
assignee: []
created_date: '2026-10-08 14:19'
updated_date: '2026-10-09 01:55'
labels:
  - packaging
  - targets
  - size-L
milestone: m-19
dependencies: []
ordinal: 55110
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/guide/07-distribution.md documents `zinc export --target wasm` (static site) and `--target esp32` (firmware + flash.sh) from the prototype; the engine answers `unknown target 'wasm'`. Bring both back (ps1 stays parked with ZN-137). Split per target.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `zinc export --target wasm` writes index.html, app.js, app.wasm and the site runs the hello and a UI example headless in Chrome (tools/cdp.py)
- [x] #2 `zinc export --target esp32` writes the firmware image and flash.sh; the image boots in QEMU
- [x] #3 the guide matches what the engine does
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done through ZN-326.01 (wasm static site, Chrome) and ZN-326.02 (esp32 core + program images, QEMU). usage: n/a
<!-- SECTION:NOTES:END -->
