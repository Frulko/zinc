---
id: ZN-834
title: 'reMarkable: ink lane v2 and the L1/L2/L0 backend selector'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-25 15:09'
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
- [ ] #1 bridge v2: no load-time XOVI conditions or overrides on libqsgepaper, framebuffer-spy getFramebufferConfig import, vendor symbols by dlsym at run time, rendering blocked per stroke with a deadline, update(rect) settle, one crash per boot then disarmed, refused on a double hook (extensions.d check), hash-gated
- [ ] #2 display-rmpp: lane.h replaces direct.h (Hello with hash, stroke begin/end, Ink(rect) read from the qtfb shared memory, no pixels over the socket); native.h is the L2 engine shim (dlopen, ABI row per hash, WATCHDOG=1 per frame); input.h leaves the power key to the lease; downgrade L1 -> L0 on any error, one way
- [ ] #3 tests/t1/rmpp_sim.sh with a fake lane socket proves the backend choice per manifest option and the L1 -> L0 downgrade on EOF; the Docker fake-xochitl harness exists (by hand, not in a tier)
- [ ] #4 docs/targets/remarkable-paper-pro.md describes the three layers and the safety rules
<!-- AC:END -->
