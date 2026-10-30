---
id: ZN-895
title: Galène media server as a pinned tool of zinc toolchain
status: Backlog
assignee: []
created_date: '2026-10-30 22:57'
labels:
  - net
  - media
  - toolchain
  - size-M
milestone: m-28
dependencies: []
ordinal: 589460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
D-record: Galène (MIT, Go/Pion) is the SFU of self-hosted calls (webrtc-selfhost-design.md §3). Upstream ships no binaries: tools/build-galene builds a pinned tag (galene-1.2.1) with the pinned Go, CGO_ENABLED=0 -ldflags='-s -w', for darwin-arm64, linux-arm64, linux-armv7, linux-amd64, with sha256 and LICENCE; zinc toolchain knows the tool (URL of the Zinc release asset, checksum) and installs it under ZINC_HOME. Publishing the assets is the owner's step (exact command in the notes).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tools/build-galene builds the four targets reproducibly and prints their sha256 and sizes
- [ ] #2 zinc toolchain install galene installs and verifies it from a local file URL in the test (no network in tests)
- [ ] #3 Binary sizes and idle RSS on the Mac recorded; decision record written with the scores of §3.2
<!-- AC:END -->
