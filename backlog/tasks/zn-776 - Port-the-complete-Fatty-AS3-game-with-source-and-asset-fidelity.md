---
id: ZN-776
title: Port the complete Fatty AS3 game with source and asset fidelity
status: Done
assignee: []
created_date: '2026-10-22 19:56'
updated_date: '2026-10-22 19:57'
labels: []
dependencies: []
ordinal: 512460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port the complete 2013 Fatty Flash/Starling game to TypeScript on Zinc while preserving its original architecture, source style, comments and assets. Keep changes to platform adaptation and the obsolete score service.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Identify the most complete source and retain its package/class architecture, comments and unchanged assets in TypeScript.
- [x] #2 Run the original screens, targets, animations, music and local persistent Top 5 on Zinc.
- [x] #3 Prove target rules, input, navigation, full game lifecycle, idle behavior and source/asset fidelity with targeted tests.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner request: port /Users/mowmow/Desktop/Fatty with the least changes, keeping the AS3 architecture, code style, assets and comments. Selected Projet Flash after comparing all versions and Gobelins.zip. QuickJS within Zinc preserves constructor arrays and AS3 method closures; a local adapter reuses zinc:stage rather than changing the engine. All 27 sources and original assets/comments are checked. TypeScript and bundle checks, fatty T1 (full 60-second simulation, real pointer hit, six reviewed goldens, variable-rate name entry, saved Top 5, navigation and idle), and fatty_logic pass. No native/AOT or cross-target claim; the legacy web preloader is not replayed for local resource loading. No dependency or engine change. Usage: n/a for Codex.

The two AS3 page managers resolve every APage class, including cross-screen destinations; the shared constructor lookup preserves that nesting. Keyboard events are consumed once per host frame even with zero or several fixed simulation ticks. Both were checked in targeted regressions. Original source, image/XML/font and MP3 bytes are retained and verified. Run: build/zinc run examples/fatty. Nothing pushed.
<!-- SECTION:NOTES:END -->
