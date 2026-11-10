---
id: ZN-1114
title: Honor reduced motion in shared layer transitions
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-10 02:48'
updated_date: '2026-11-10 03:10'
labels:
  - ui
  - size-S
milestone: m-32
dependencies: []
ordinal: 1240.2
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Original Mail compose and shared Dialog/Sheet animate scale/slide even with ui.prefersReducedMotion true. Public ui.openLayer scale duration340 minimum17lines and20paint logs in .logs/blockers/layer-reduced-motion/reduced-layer-core.ts + reduced-layer-core-{interp,native,quickjs}.log. All3 flagtrue, paint2p0,paint3p0.1399678479,paint6p0.4804336190,paint20p0.9983716670. Natural app uses unchanged kit; do not add per-app animationnone workaround. Determine intended shared layer/provider ownership, then honor reduced motion at common layer entry/step/exit including toggled preference, input/focus/cleanup. Limited isolated-worktree correction authorized by coordinator only for shared layer entry/step/exit near8374. Other session sparseMap/Fenwick WIP near639/1074 is preserved and never copied, reset or committed; its patch SHA is archived in .logs/blockers/responsive-display/external-virtualization-wip.sha256 and must match after integration. The minimal independent layer patch cannot alter virtualization/runtime/HAL. Primary short research https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html. No owner question; independent backlog continues.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dialog Sheet and public shared layer transitions honor reduced motion on open and close and when preference changes, preserving final geometry focus and lifecycle cleanup
- [x] #2 Exact small T0 and original unchanged Mail compose reduced-motion proofs pass all3; public kit size thresholds remain unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Shared stepLayer now snaps to its current visibility goal while reduceMotion is active. Keeping the configured motion/duration intact restores normal animation on a future open after preference is disabled. The same owner handles public layers, Dialog and Sheet; no app motion override, focus/provider replacement or lifecycle state added.

Research: W3C Animation from Interactions https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html recommends respecting the user's preference and disabling nonessential interaction motion. Coordinator research inherited; Sonnet unavailable, primary reference read directly.

Exact ui_layer_reduced T0 PASS interpreter/AOT/QuickJS: all seven motion forms; preference enabled before opening; reduced open/close; changes during normal entry/exit; normal motion restored; final geometry; Dialog/Sheet focus ownership and restoration; reopen, closeLayer/destroy and backdrop cleanup. zinc check PASS. Original unchanged Mail App compose import-only probe PASS all3: first visible paint progress1, full1080x760 geometry, focus in dialog, next close paint progress0 and focus restored to Compose. Source and binary hashes plus raw logs in .worktrees/1114/.logs/ui-layer-reduced/. Mail App SHA25650c673f6b4168bed65c7f4c5623141f50ba3d284c21c07a3e57939ad9a5c42b7. Original coordinator minimum recorded moving progress despite reduced=true before this correction.

Unchanged final kit_size raw PASS after ZN-1114, ZN-1115 and reopened ZN-1112 fixes: JS direct235981/index246196/ten283045B, unused10215<10240 (25B margin), per-component4094<4096; AOT5325320/5474000/6025776B, unused148680<163840, per-component61308<65536. No threshold, icon, capability or manual-minification change. These are binary/bundle size values, not performance measurements. Raw output and source hashes: .worktrees/1114/.logs/kit-tabs-idle/{size-raw.log,gate-manifest.json}.

All checks use read-only common engine SHA25647a238519a706c385c312611ea9c17487944861e4bd660c012fe6ef643881764, ZINC_ROOT=.worktrees/1114. No C++ engine build, runtime/HAL or virtualization change. All runs bounded and headless through coordinator work-run; no process left running. No suite, benchmark, cross-device, physical keyboard or screen-reader run. usage: n/a.

Proposed tests:
- ZINC_BACKGROUND=1 zinc run examples/ui/mail, real system preference toggled while composing and closing, with keyboard/screen reader; about60s, memory not measured.
<!-- SECTION:NOTES:END -->
