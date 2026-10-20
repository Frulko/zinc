---
id: ZN-721
title: Package the museum demo as a standalone macOS app
status: Done
assignee: []
created_date: '2026-10-12 09:04'
updated_date: '2026-10-12 09:12'
labels:
  - packaging
  - macos
  - size-S
milestone: m-19
dependencies: []
ordinal: 486410
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The museum project has app identity metadata and produces a signed .app with its assets
- [x] #2 The distribution carries all non-system dynamic library dependencies and starts outside the source project
- [x] #3 A size breakdown explains baked images, fonts and the adjacent asset pack; the .app and zip are available locally
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner requested an explanation of the museum binary/assets size and a .app distribution. Added dev.zinc.museumtable / Museum Table identity metadata. Built examples/museum-table/build/museum-table.app with the existing build --bundle command. Extended tools/package with --app using its existing macOS dylib bundler; it now closes the transitive dependency graph, rejects missing/colliding libraries, rewrites executable/library paths, signs/verifies nested code and writes a ZIP. Regression package_app PASS builds an app -> outer dylib -> inner dylib, removes the original source directory, extracts the ZIP elsewhere and verifies output 42 and the bundle signature. Existing package T0 PASS. Real museum ZIP extracted outside the repository, signature verified deep/strict, every Mach-O dependency checked, then launched from / for 3 headless frames with DYLD_PRINT_LIBRARIES; no Homebrew references or loads, story starts sequence ukiyo-e. Artifact: build/museum-table.app.zip 66,816,077 bytes; app files 137,509,391 bytes; 15 dylibs 34,652,192 bytes. Detailed payload JSON is build/museum-table-sizes.json; baked images/fonts breakdown also in README and perf log. Rebuild commands in README. Local ad-hoc signing only; Developer ID/notarization and other architectures not attempted. usage: n/a (Codex transcript unavailable to tools/usage).
<!-- SECTION:NOTES:END -->
