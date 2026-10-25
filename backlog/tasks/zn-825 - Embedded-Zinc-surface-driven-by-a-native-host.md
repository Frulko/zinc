---
id: ZN-825
title: Embedded Zinc surface driven by a native host
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-25 11:00'
labels:
  - size-L
  - embed
  - native
dependencies: []
ordinal: 534460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-25): launch the Swift/Godot/Blender workflows and demos with agents. Implement one externally driven Zinc instance with an offscreen display, host input and lifecycle. Reuse HalDisplay and HalFrame. Shared foundation for Swift and Godot integrations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A C-importable host boundary drives one Zinc program without creating a secondary window
- [x] #2 A persistent surface exposes documented dimensions stride channel order alpha ownership and frame lifetime
- [x] #3 Resize input pause resume and clean shutdown are covered by targeted native tests
- [x] #4 Existing standalone application behavior remains covered and the host contract is documented
<!-- AC:END -->

## Delivery contract

Owner clarification (2026-10-25): deliver a real runnable project, source files, a README with exact build/run/test commands, required native or authoring project files, and actual execution evidence. A specification or mock alone does not satisfy this task. Do not mark unsupported or unexecuted behavior as Done.

## Implementation notes

Real implementation: include/zn/embed.h, src/app/embed.cpp (HalDisplay), tools/link-embedded, docs/reports/zinc-next-embed.md and tests/t0/embed.sh. Build: tools/build zn_app. C99 header and C++ -Wall -Wextra -Werror syntax checks passed. Real AOT regression passed: `BUILD=build ZINC=/Users/mowmow/Lab/zinc/build/zinc tests/t0/embed.sh` printed `embed: offscreen alpha input pause resize shutdown passed`. It asserts no SDL window, transparent background and 50% red coverage, pointer input, pause serial stability, 2x resize and repeated quit.

Alpha opts into interpreting CLEAR as transparent and reconstructs premultiplied output through existing black/white raster passes; no raster changes. Queue acceptance is not widget consumption. IME/a11y/native clipboard and restart/multi-instance are explicitly outside the contract.

AC4 remains unchecked until coordinator runs `BUILD=build ZINC=build/zinc tests/run --only app_library` after integration; the existing standalone test may create a window and must run alone. Host contract documentation is complete.

Cross-platform pass: ZN-825: verify the C offscreen host surface and host linker on Windows, then mobile; only macOS was built here.

Coordinator integration (2026-10-25): tools/build zn_app passed on develop. Integrated tests/run --only embed, swift_observatory and app_library all passed; standalone hello output, rn-showcase frame hash, timers and library isolation regression are covered. Scene exchange, Blender library and Godot export tests also passed after shared integration. No new window proof, cross-platform execution or benchmark claimed.
