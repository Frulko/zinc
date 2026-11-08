---
id: ZN-1044
title: 'zinc doctor, zinc update and plugin install polish'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:39'
updated_date: '2026-11-08 20:45'
labels:
  - cli
  - size-S
milestone: m-19
dependencies: []
ordinal: 4100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
First-run and update paths are noisy or incomplete.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-718: a project that sets a plugin's options misses the prebuilt key and the install has no C++ for it: ship every plugin's sources or use the index.
- ZN-718: `zinc doctor` prints 35 plugin lines in a source build: shorten; `zinc update` downloads but does not install: reuse `install.sh`'s swap.
- ZN-718: `zinc device update` (the agent's engine update on a device) still only downloads and verifies; it could reuse `updateCommand` of src/tc/selfupdate.cpp to install and roll back.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc doctor prints a short plugin summary in a source build
- [x] #2 zinc update installs, not only downloads
- [x] #3 A project with plugin options finds its prebuilt or its sources
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worker, 2026-11-08).
- #1: the short zinc doctor already has one plugin line ('Plugins: each one is built the first time...'); the 35+ lines were zinc doctor --details. It now groups the plugins without a prebuilt library by reason, one line per reason, and a reason held by more than 8 plugins prints their count ('built here on first use: 57 plugins (zinc plugins lists them)'). --details went from 139 to 78 lines here. install_nocompiler's greps still match.
- #2: zinc update already installs (src/tc/selfupdate.cpp install(): unpack beside the engine, rename the engine to engine.prev, the new one in place, --rollback swaps back); tests/run --only self_update passes (it proves the swap, .prev and the link). Nothing to change.
- #3: tools/package ships the whole plugin directory (minus prebuilt/) of every plugin whose plugin.json has "options" (3d, camera, devtools, map, microphone, video, webview, the display drivers: about 2 MB uncompressed), beside its prebuilt library; plugin_build.cpp: an install without the C++ whose prebuilt key misses now says why (built for other options, no C++ to build it with zinc.json "plugins" options: remove them, or update zinc) instead of 'has no native source'. Proven by hand on zinc:devtools: an install-like copy (.ts, plugin.json, prebuilt) builds 'prebuilt' without options, refuses with the new message with port 9333, and with its sources builds ('built 1.79s').
- Decision: ship sources of the option-bearing plugins rather than fetch from the index (the index's binaries are keyed by the sources too, and an install with no sources cannot compute that key; the sources cost ~2 MB against the 65 MB budget). Moving options from compile-time defines to load-time configuration would remove the rebuild altogether: later.md line.
- Not done (not a criterion): zinc device update reusing updateCommand to install and roll back: later.md line.
Proposed tests: tests/t1/install_nocompiler.sh with ZINC_DIST (a package: a project setting a plugin option builds it on first use), tests/t0/package.sh.
<!-- SECTION:NOTES:END -->
