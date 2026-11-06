---
id: ZN-995
title: 'Harden state: plugin handles carry a generation'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-06 07:23'
updated_date: '2026-11-06 07:32'
labels:
  - size-M
  - plugins
  - hardening
dependencies: []
ordinal: 754080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/implicit-state-machines.md (#18, #19, #21, screen-capture). Slot tables reuse the lowest free index, so queued events and stale objects reach a new object. Reproduce first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 script: a disposed Script cannot evaluate in, or settle a call of, a VM that reused its handle; regression test
- [x] #2 socket: a deferred event for a freed handle is never delivered to (or frees) a socket that reused the slot; regression test
- [x] #3 webview: close() drops the view's queued events and pending invoke replies; a stale WebView after close() is inert; regression test on the sim backend
- [x] #4 screen-capture: a late stop callback of an old stream cannot change the state of a new session in the same slot
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Handles now carry a generation: handle = slot + table size * generation (24-bit, wraps), looked up by slot and compared whole, so a stale handle or a queued event of a freed object never reaches the object that reuses the slot.
- #1 script: reproduced (stale Script.eval read the new VM, a late exposeAsync settle resolved the new VM's call of the same id, a stale set wrote it). Fixed in the engine's src/qjs/script_native.cpp (the one zinc runs), the same in plugins/script/native/quickjs.host.cpp and quickjs.sim.ts; index.ts keeps engines in a Map by handle. Test: tests/conformance/script_reuse.ts in t1 script (interp + AOT).
- #2 socket: does not reproduce. The engine path (src/host/sock.cpp, socket.next.ts, the default) already uses monotonic ids. The plugin's socket.host.cpp (ZINC_NATIVE=real, confirmed built) only defers events for handles the program has no object for yet, and the deferred list is drained before anything can free them; a data callback that closes and reconnects into the same slot was tried and is fine. No change; tests/golden/host/socket_reuse.ts added to t0 socket as the regression guard (passes on both paths).
- #3 webview: reproduced on WKWebView (the old view's queued a2, a stale eval and a stale postMessage all reached the view that took the slot). Fixed in src/webview.mm (bridge vid is the handle; poll drops events of closed views) and the same in webview.linux.cpp (not built here: cross-platform pass). The sim backend already hands out monotonic ids and emits no events, so the regression test runs on the real backend: tests/t1/webview.sh reuse scenario. Android already uses monotonic ids.
- #4 screen-capture: fixed by reading (needs a stream stopped by the system, which no test can trigger without the recording permission): ZnScOut owns its mutex (destroyed in dealloc), release() clears its state/why pointers under the lock and didStopWithError writes only while they are set. t1 screen_capture passes (native .mm compiled).
<!-- SECTION:NOTES:END -->
