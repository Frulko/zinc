---
id: ZN-167
title: >-
  Callbacks and promises through CallNative (native process and socket from
  programs)
status: Done
assignee: []
created_date: '2026-10-07 07:35'
updated_date: '2026-10-07 08:47'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Closures can be passed to native exports (c(params>result)) and promises returned (P<t>): nsig::Sig, a handle table and the registry sink (hold/release/call/resolve/reject) in rtcalls, new Rt row host.nativePoll run by the prelude loop each turn, generated Promise wrapper for Promise<T> members, thunks with cb_post/cb_call lambdas and loop_ref while a Poller is active. wasm.ts, socket.ts conformance and a zinc:process spawn pass on the native plugins; tests/golden/run/native_callbacks.ts passes interpreted and compiled. Limits: zrt::Promise<T> in thunks (gphoto2) not generated; callback string results copy to a static buffer valid until the next call.
<!-- SECTION:NOTES:END -->
