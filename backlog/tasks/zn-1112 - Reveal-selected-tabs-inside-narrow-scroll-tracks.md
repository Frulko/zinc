---
id: ZN-1112
title: Reveal selected tabs inside narrow scroll tracks
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-10 02:26'
updated_date: '2026-11-10 03:10'
labels:
  - ui
  - size-S
milestone: m-32
dependencies: []
ordinal: 1218
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Settings23 narrow page exposes clipped selected/focused tabs. Minimal default Quiet Tabs in a width360 p4 View, four labels Profile/Notifications/Appearance/Account, className=w-full. End on Profile selects3, but at48frames scrollLeft remains0 on all3; track[16,16,328,36] right344, Account right416 interp/AOT or360 QuickJS. Original Settings Account label/focus truncated. Repro and all3 logs .logs/blockers/tabs-reveal/tabs-repro and tabs-*.log. Fix existing Tabs/reveal owner rather than caller sizing/wrapping or a new widget; inspect NavigationTabs/shared reveal callers, motion/reduced motion and nested scroll. Source lib/std/kit/tabs.tsx uses ScrollView and revealTab; source of failure not assumed. Keep existing keyboard/disabled/controlled contracts, dispose watchers. Primary short research https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ (roving keyboard and End selection); Sonnet unavailable. Protected lib/std/ui.ts/runtime/HAL external WIP and frontend1111 belong to other sessions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Existing Tabs and shared reveal callers keep selected and focused tabs within the scroll viewport after keyboard, pointer and controlled selection, with reduced motion and lifecycle cleanup preserved
- [x] #2 Exact small T0 regression and original unchanged Settings narrow reproduction pass across all three engines; unchanged public kit size thresholds pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed in the existing Tabs/NavigationTabs providers; TabBar inherits the shared provider. ScrollView starts with vertical-only scroll=1; flex-row does not enable the X axis, and animated scrollTo ignores X without scroll&2. Both tracks now use the existing overflow-x-auto class. Shared reveal computes the minimal delta inside the track's padding and issues one scrollTo, preserving normal/reduced motion and the existing owner cleanup. Read all tab/reveal callers and the scroll bounds/extent contract; no caller sizing/wrapping, engine patch or new widget.

Research inherited from coordinator: WAI-ARIA Tabs APG https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ confirms Home/End and roving keyboard focus. No dependency needed. Sonnet unavailable; no additional CLI agent launched.

Proof: kit_tabs_reveal PASS with Solid and React on interpreter/AOT/QuickJS. Covers End, Home, wrapping, disabled skip, pointer and controlled selection, normal/reduced motion, stable nested scroll offset and unmount/remount. Assertions include the two-pixel focus outline. Baseline providers from HEAD fail the exact fixture with clipped tab/focus. Both fixture programs zinc check PASS. The unchanged original Settings App interaction harness passes 49 frames at360x800 on all3; Account [265,133,76,30] inside track[16,130,328,36], scrollLeft19. Three final screenshots inspected; final source's captures have identical hashes. Original Settings sources unchanged.

Unchanged kit_size PASS: JS direct235962/index246177/ten282868B, unused10215<10240, per-component4076<4096. AOT5325320/5474000/6025760B, unused148680<163840, per-component61306<65536. Initial padding getters crossed the used-JS limit; reusing exported inspectNode's readonly pl/pr/sx fields removes redundant property resolution. Verified getNumber/currentValue/propValue and scrollLeft return those same fields, including during animation. No threshold, icon or capability cuts; no manual minification. These are size-gate values, not timing/performance claims.

Provenance/raw logs/screenshots/source+engine SHA256: /Users/mowmow/Lab/zinc/.logs/blockers/tabs-reveal/fixed-1112/provenance.json. Common read-only engine SHA2563978659916223a6a6dccb3c5e474423e9fcc2f8d9455a92abc831b8d073ed5af, no engine build. No process left running. usage: n/a.

Proposed tests:
- ZINC_BACKGROUND=1 zinc run examples/ui/settings --interp: physical keyboard/touch and screen-reader navigation through narrow tabs, including resize/rotation; about60s, memory not measured.
- On the available test devices, the same Settings/kit navigation smoke with normal/reduced motion and custom/underline variants; about60s each, memory not measured. No suite, benchmark, conformance or cross-device run started.

Reopened hidden-idle regression corrected in shared tab visibility/reveal owners. tabShown checks the track's ancestor chain before either Basic Tabs scroll reveal or NavigationTabs indicator work. Reveal also refuses zero-sized track/tab geometry. Existing watcher cleanup and latest controlled selection remain in place; no app unmount workaround, timer, new scheduling state or provider.

Research retained: WAI-ARIA Tabs APG https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ requires roving focus/Home/End behavior; existing exact reveal test continues checking that contract.

New kit_tabs_idle T0 PASS Solid/React and all3 with no app frame callback: initially-hidden tabs remain paint-idle over8ticks, previously shown/cached hidden geometry stays idle, changing selection while hidden stays idle after its state update, reopen reveals latest Account selection, unmount disposes watchers and remount reveals selection again. Both Basic and Rich tracks covered; normal preference for initial hidden case, reduced motion for repeat geometry/reveal cases. Existing kit_tabs_reveal exact T0 PASS both models/all3 after fix: animated/immediate reveal, disabled skip/wrap, keyboard/pointer/controlled state, two-pixel focus outline and nested-scroll stability.

Original unchanged Settings App49-frame narrow harness PASS all3 at360x800; zinc check PASS test programs and Settings. Raw logs/captures .worktrees/1114/.logs/kit-tabs-idle/. The coordinator's original no-timer minimum painted299 of300ticks; no benchmark claim is made. Original Notes snapshots now also render without caller workarounds after shared display fix.

Unchanged final kit_size raw PASS after ZN-1114, ZN-1115 and reopened ZN-1112 fixes: JS direct235981/index246196/ten283045B, unused10215<10240 (25B margin), per-component4094<4096; AOT5325320/5474000/6025776B, unused148680<163840, per-component61308<65536. No threshold, icon, capability or manual-minification change. These are binary/bundle size values, not performance measurements. Raw output and source hashes: .worktrees/1114/.logs/kit-tabs-idle/{size-raw.log,gate-manifest.json}.

All checks use read-only common engine SHA25647a238519a706c385c312611ea9c17487944861e4bd660c012fe6ef643881764, ZINC_ROOT=.worktrees/1114. No C++ engine build, runtime/HAL or virtualization change. All runs bounded and headless through coordinator work-run; no process left running. No suite, benchmark, cross-device, physical keyboard or screen-reader run. usage: n/a.

Proposed tests:
- Actual Notes/Settings keyboard+resize smoke on the test devices with hidden and visible tab sections and reduced-motion preference changes; about60s each, memory not measured.
<!-- SECTION:NOTES:END -->

Reopened during original Notes proof: natural Tabs under hidden ancestor issues299 paints in300 ticks on common47a238 with no app timer/framecallback. Minimal .logs/blockers/hidden-tabs-idle/idle-tabs.tsx and log. Shared reveal follows a hidden zero-sized track, repeatedly requests animated scroll. Fix owner reveal scheduling/visibility, test initial-hidden plus hide/reveal/remount and preserve latest selection/focus. No app unmount workaround. Short deterministic paint-count T0 (not benchmark), unchanged kit gate final. Coordinator adds this as third unit in existing UI chain after1114/1115.
