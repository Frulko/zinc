---
id: ZN-540
title: 'Vendor three.js r162 as the WebGL 1 (tier T2) three, selected by tier'
status: Backlog
assignee: []
created_date: '2026-10-09 07:45'
labels:
  - rpi
  - 3d
  - size-S
milestone: m-25
dependencies:
  - ZN-538
ordinal: 340060
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add third_party/three-r162 (MIT, 0.162.0 npm tarball, unmodified) next to r186. The QuickJS import map resolves 'three' to r162 when the context is WebGL1 or the tier is T2 (zinc.json can override). Document the API drift between r162 and r186 for application code. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests/three cube and a Lambert-material glTF scene pass SSIM >= 0.9 against Chrome WebGL1 under the vc4 profile
- [ ] #2 the same scenes run on the Pi 3B+
- [ ] #3 third_party/README.md and the SBOM list r162
- [ ] #4 docs/plugins/three.md documents tier selection and drift
<!-- AC:END -->
