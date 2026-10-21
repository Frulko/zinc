---
id: ZN-773
title: 'JavaScriptCore and V8 engines next to QuickJS, behind Node-API'
status: Backlog
assignee: []
created_date: '2026-10-21 10:48'
labels:
  - engine
  - plugins
  - perf
  - size-L
milestone: m-9
dependencies: []
ordinal: 501460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-21): `--engine jsc` and `--engine v8` next to QuickJS-ng, the three kept; one fast and clear binding ABI so any engine plugs in without losing features; engines downloaded automatically. Design and evidence: docs/reports/js-engines-jsc-v8.md (Node-API as the single binding ABI, a small zn_engine C interface for what Node-API lacks, engine packs as signed TUF targets, V8 built by our own CI). Steps are the subtasks; the cross-platform pass (Linux JSC pack, Pi JIT, Windows and Android from Bun's WebKit, V8 armhf) goes to backlog/later.md.
<!-- SECTION:DESCRIPTION:END -->
