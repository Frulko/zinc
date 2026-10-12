---
id: ZN-722
title: Instrument and remotely drive the museum lifecycle
status: Done
assignee: []
created_date: '2026-10-12 12:00'
labels: [perf, devtools, size-M]
milestone: m-21
dependencies: []
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An explicit museum diagnostic mode accepts loopback remote navigation, state queries and screenshots through the existing DevTools transport
- [x] #2 Snapshots report live image, video and 3D resources, separating CPU ownership, borrowed buffers and estimated GPU storage
- [x] #3 A reusable driver repeats home, model, video and home, waits for completed transitions, and records the native process RSS and snapshots
- [x] #4 Targeted regression tests and a live native run prove control and document retention without claiming RSS alone proves a leak
- [x] #5 Diagnostic tools remain reusable: common resource-probe driver, per-demo JSON scenarios and remote counter sampling without confusing remote and local process RSS
<!-- AC:END -->

## Implementation Notes

Owner requested instrumentation and remote control of the museum memory investigation. Reuse the existing CDP loopback transport, opt in with --probe, and navigate through the player's existing transition logic. No arbitrary code evaluation or external listening address. Native resource providers register read-only counters; the runtime remains independent of plugin names. No lifecycle policy changes in this diagnostic task.

Implemented optional native resource providers, the appended host.resourceStats row and Zinc.getResourceStats in both CDP transports. Museum --probe adds state, navigation through Player.go and screenshots; disables idle attract/reset and uses wall time headless. tools/museum-probe checks endpoint PID, waits for completed transitions and records owned CPU / borrowed / estimated GPU bytes and app RSS. PASS resource_stats (interp/AOT images, software target/mesh destroy, real FFmpeg close), museum_probe T1, devtools_port T0. Real native GUI: three cycles, stable retained pools at home (1 model, 1 target, 12.96 MB CPU / 155.52 MB GPU estimate; 1 stopped video, 8.20 MB buffers and 2 open sources). Separate model/video PNGs inspected; captures perturb RSS so disabled by default. Full details and limits: docs/reports/zinc-next-museum-memory-probe.md. No memory policy fix, no cross-platform/full corpus checks. Usage n/a for Codex.

Owner follow-up: keep the diagnostic tools reusable for other devices/demos. Extracted tools/resource-probe with configurable state/navigation methods and route; tools/scenarios/museum.json contains the museum specifics and museum-probe is an 8-line entry. --remote samples forwarded endpoint counters without local ps. Resource_probe T0 verifies another demo protocol, initial-state navigation, route validation and remote no-RSS; museum_probe T1 also drives remote mode against a local endpoint. README/dev-mode document reuse and remaining device verification.
