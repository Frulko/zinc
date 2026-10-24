---
id: ZN-724
title: >-
  Measure Longbridge's quickjs-jit as the base of QuickJS's JIT (decision
  against D110)
status: Backlog
assignee: []
created_date: '2026-10-12 09:57'
labels:
  - perf
  - quickjs
  - decision
  - size-M
milestone: m-21
dependencies: []
ordinal: 1600
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-12: "for the JIT in QuickJS, can we start from their base and improve or complete it?" quickjs-jit (github.com/longbridge/rquickjs, MIT, 0.12.11 of 2026-10-01) is a feedback-driven baseline and optimizing JIT for quickjs-ng: a 2,800-line patch of quickjs.c with a versioned C interface for an external backend (quickjs-jit.h: hot events, type and shape feedback, a helper table with ownership rules, snapshots, invalidation), and the backend, 59,000 lines of Rust on Cranelift (+3.7 MB). Its own numbers: 32 to 45x on numeric kernels, 0.99 to 1.00x on a realistic application panel, test262 identical in JIT mode. Its own analysis (docs/PERFORMANCE_ROADMAP_V8_BUN.md, 2026-09-27): 124 of about 255 opcodes refused (closure variables, push_this, throw, typeof, for_of, try), no native call between compiled functions, some cases slower than the interpreter; its roadmap: P1 its own overhead (2 to 3 weeks), P2 baseline coverage (4 to 6 weeks), P3 a native calling convention (4 to 8 weeks), P4 the optimizing compiler. Nothing of it was built or run here: p5 and three are made of methods that use this, so no gain is expected today (not measured). Before ZN-723 writes a compiler of our own, measure what this base gives and what it costs. Pin the version and its checksum as for every vendored library; the Rust toolchain stays optional (a module, as libzn_webgl).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 quickjs-jit at a pinned version built on the development Mac: bench/qjs three, sprite, objects, physics and p5shape on its interpreter and with the JIT, and the share of the functions of three.core.js and p5.min.js its policy refuses
- [ ] #2 its QuickJS patch against quickjs-ng 0.17.0 with our queue: applies, or what conflicts; the test262 subset and the QuickJS T1 tests with it applied and the JIT detached
- [ ] #3 the cost written down: Rust and Cranelift in the build as an optional module, size, the macOS entitlement, the targets without executable memory
- [ ] #4 a decision recorded against D110: our JIT starts from this base (and which phases of its roadmap we take or contribute), or ZN-723's compiler goes first; ZN-723's description updated to match
<!-- AC:END -->
