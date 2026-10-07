---
id: ZN-167
title: >-
  Callbacks and promises through CallNative (native process and socket from
  programs)
status: Backlog
assignee: []
created_date: '2026-10-07 07:35'
labels:
  - abi
  - runtime
milestone: m-9
dependencies: []
ordinal: 40415
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-099 runs the plugins' process and socket native code behind the ABI from a C++ driver (callbacks queued with cb_post), but a Zinc program cannot pass a closure to a native export yet: requireNative<Spec> reports Z5010 for callback and Promise members. Add callback handles for Zinc closures (cb_retain/cb_call/cb_post drained on the loop, results as Zinc values), Promise results (ZN_PENDING resolved from a thread) and the matching verifier, VM, AOT and frontend support, then run the process and socket plugin programs natively.
<!-- SECTION:DESCRIPTION:END -->
