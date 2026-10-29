---
id: ZN-861
title: Verify native resource parity in CarPlay Local UI probe
status: Done
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
- [x] #1 Check the reported missing text/images with decoded pixels and an asset-free fixture
- [x] #2 Verify interpreter, fresh/cached AOT and QuickJS render the same resources; fix only a reproduced engine defect
- [x] #3 Confirm the generated CarPlay Local UI probe contains text and packaged images in native mode
<!-- AC:END -->

## Investigation and correction

The original visual inspection of screenshot previews reported missing native
text/images. That diagnosis was wrong. Decoded pixel arrays of POC 1
(`/private/tmp/carplay-local-ui-poc-ready.png` vs `carplay-local-ui-interp.png`)
are identical at 2400×1440. POC 2 `capture-native.png` and
`capture-interpreter.png` in `build/carplay/local-ui-component-2` are identical at
2520×1120. Their original command streams also match byte-for-byte. A cropped
header confirms the supposedly missing text is present. No cache, font, AOT or
raster defect has been reproduced; no engine code was changed.

`tests/t1/ui_resource_parity.sh` uses generated checkerboard PNGs and text without
Apple assets. It compares fresh/cached native, interpreter and QuickJS pixels,
then checks text ink, colored image pixels and label strings so equal empty
frames cannot pass. The criteria were clarified to reflect investigation rather
than demand an unjustified engine patch. This replaces the earlier unverified
cache/stripping hypotheses. Full Local UI runtime work remains in ZN-858.

Validation: `tests/run --only ui_resource_parity` PASS on the development Mac, 2026-10-29. All four decoded frames match; text and image content assertions pass.
