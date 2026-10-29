---
id: ZN-861
title: Fix native resource rendering in CarPlay Local UI probe
status: Backlog
assignee: []
created_date: '2026-10-29 22:30'
labels:
  - ui
  - size-M
dependencies: []
ordinal: 563460
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Reduce the missing native text and images to an asset-free regression
- [ ] #2 Fix the engine and verify interpreter, AOT and QuickJS render the same resources
- [ ] #3 The generated CarPlay Local UI probe displays text and packaged images in native mode
<!-- AC:END -->

## Investigation notes

Generated build/carplay/local-ui-probe-4 renders SVG geometry but no text/images with native AOT (also after 120 frames). The same source under --interp displays all text and three original decorative PNGs. Earlier probe-3 native screenshot included text/images; the change to probe-4 only changes the SVG point coordinates. Suspect cache/resource integration; not yet diagnosed. Commands: ZINC_BACKGROUND=1 ZINC_FRAMES=10 ZINC_SHOT=/tmp/probe.png build/zinc run [--interp] build/carplay/local-ui-probe-4. No Apple assets should be committed: first reduce to generated/public-domain image data. Work this before extending native Local UI rendering.


Further evidence: probe-4 repeated cached run rendered all resources correctly without an engine change. POC 2 `build/carplay/local-ui-component-2` reliably displays the three baked gauge images but loses all explanatory Text nodes in AOT (cached run and independent `zinc build` with ZN_KEEP_SYMBOLS=1). Interpreter shows text and images. `/private/tmp/carplay-original-component-repeat.png` versus `/private/tmp/carplay-component-interp2.png`. installResources was observed returning true in LLDB for the earlier probe. Do not assume cache corruption or stripping; isolate this JSX/image/text combination using generated asset-free PNGs. No engine fix claimed.
