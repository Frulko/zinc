---
id: ZN-541
title: >-
  zinc:three-pi helpers: material downgrade, merging, 16-bit split, warm-up,
  native KTX2 to ETC1
status: Backlog
assignee: []
created_date: '2026-10-09 07:45'
labels:
  - rpi
  - 3d
  - size-L
milestone: m-25
dependencies:
  - ZN-539
  - ZN-540
ordinal: 340070
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A helper module for real three.js on T2: downgrade Standard and Physical materials to Lambert or Gouraud, keeping map, color, emissive, lightMap and aoMap; drop features that need derivatives; merge static meshes by material; split geometries over 65535 vertices; warm up with renderer.compile and set checkShaderErrors false; replace KTX2Loader with the vendored basis_universal transcoder (Apache-2.0), which outputs ETC1 or RGB565 without WASM or workers. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a glTF diorama with >= 100 meshes loads and renders on the Pi 3B+ with no shader errors
- [ ] #2 the diorama runs at >= 45 fps on the Pi 3B+ (960p internal, 1080p output, with RPI-3D-03)
- [ ] #3 a KTX2 ETC1S file decodes to ETC1 natively; transcoder vendored with licence and pin
- [ ] #4 the helpers are no-ops on T3/T4, so the same code runs on macOS
<!-- AC:END -->
