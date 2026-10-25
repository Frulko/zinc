---
id: ZN-834
title: 'reMarkable: ink lane v2 and the L1/L2/L0 backend selector'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-25 15:09'
updated_date: '2026-10-25 15:31'
labels:
  - remarkable
  - size-L
milestone: m-11
dependencies: []
ordinal: 543460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Options 3 and the layered design of docs/reports/remarkable-bridge-design.md (§4.3, §7, §8): integrations/remarkable-ink bridge v2 (protocol 2), plugins/display-rmpp as the backend selector L1 lane -> L2 native session -> L0 qtfb, plugin.json option ink (qtfb/native/session) replacing direct.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bridge v2: no load-time XOVI conditions or overrides on libqsgepaper, framebuffer-spy getFramebufferConfig import, vendor symbols by dlsym at run time, rendering blocked per stroke with a deadline, update(rect) settle, one crash per boot then disarmed, refused on a double hook (extensions.d check), hash-gated
- [x] #2 display-rmpp: lane.h replaces direct.h (Hello with hash, stroke begin/end, Ink(rect) read from the qtfb shared memory, no pixels over the socket); native.h is the L2 engine shim (dlopen, ABI row per hash, WATCHDOG=1 per frame); input.h leaves the power key to the lease; downgrade L1 -> L0 on any error, one way
- [x] #3 tests/t1/rmpp_sim.sh with a fake lane socket proves the backend choice per manifest option and the L1 -> L0 downgrade on EOF; the Docker fake-xochitl harness exists (by hand, not in a tier)
- [x] #4 docs/targets/remarkable-paper-pro.md describes the three layers and the safety rules
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done on the Mac (worktree agent).
- display-rmpp is the L1 -> L2 -> L0 selector (rmpp.cpp); lane.h replaces direct.h (Hello with the qtfb key and pid, Welcome with the vendor hash checked against models.h, StrokeBegin/Ink(rect)/StrokeEnd(box)/Bye, no pixels on the socket); native.h is the L2 engine shim (dlopen of an engine with Quill's C ABI, vendor row by ZINC_VENDOR_SHA256, WATCHDOG=1 per frame to NOTIFY_SOCKET); input.h never opens the power key and gains evdev touch for L2; plugin.json option ink (qtfb/native/session) replaces direct. Downgrade L1 -> L0 is one way, one message.
- integrations/remarkable-ink v2: protocol 2; one override on Qt6Quick (QQuickWindow::exposeEvent) to start 1 s after the first expose; framebuffer-spy$getFramebufferConfig import; vendor symbols by dlopen(RTLD_NOLOAD)+dlsym at run time; gates (model row, framebuffer-spy geometry, SHA-256 cached in /run/zinc-ink/hash, symbols); block per stroke with 500 ms / 10 s deadline; settle = update(box) on AppLoad's FBController; crash guard /run/zinc-ink/armed (refuse for the boot when left over); install.sh refuses a double hook. probe.cpp (protocol 1) removed.
- Proof: tests/t1/rmpp_sim.sh PASS (goldens unchanged; lane run: 2 strokes through the lane, qtfb UI only; eof:5 -> 'ink lane closed; qtfb from now on' once, FAST and qtfb updates after; badhash, nolane, session outside the lease, unknown model, ink=qtfb each with its one message). bridge.cpp syntax-checked with -Wall -Wextra against Homebrew Qt 6 (0 warnings); install.sh double-hook refusal checked on a fake extensions.d.
- Not run (by hand, Docker): tests/native/rmpp/fake-xochitl/run.sh (late load, block/unblock order, deadline, crash guard, double hook, hash gate). Not provable without the tablet: real latency, the colour settle on the engine, xochitl's behaviour under blockRendering, the static binary dlopen'ing the L2 shim.
- Contract for ZN-833 (lease): the app under the lease expects ZINC_LEASE=1 and ZINC_VENDOR_SHA256=<checked hash> in its environment, LD_LIBRARY_PATH (or ZINC_RMPP_ENGINE) reaching libquill.so, and NOTIFY_SOCKET. Without the engine it exits 3.
<!-- SECTION:NOTES:END -->
