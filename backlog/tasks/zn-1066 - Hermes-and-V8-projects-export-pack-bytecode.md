---
id: ZN-1066
title: 'Hermes and V8 projects: export, pack, bytecode'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:43'
labels:
  - engine
  - size-M
milestone: m-20
dependencies: []
ordinal: 16700
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alternative JS engine projects cannot yet be exported or packed like the default.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-773.04: `zinc export --dmg`, `--key` signatures and the SBOM for jsc/v8 projects (the engine-app export returns before those steps).
- ZN-773.04: `zinc pack` and `zinc fuse` of jsc/v8 projects: a .zapp carries typed .zbc only today.
- ZN-773.07: Hermes's CDP inspector (API/hermes/cdp) behind src/dbg/ws.cpp, as V8's, for --engine hermes --inspect.
- ZN-773.07: precompile .hbc at zinc build --engine hermes through hermes_run_bytecode; optimising at run time costs 1.2 s on hero's bundle.
- ZN-773.07: the Hermes adapter keeps one handle scope open for the whole run (its Node-API roots values only inside a scope): check long programs do not grow.
- ZN-773.08: measure hero CPU on Hermes built with and without its debugger on a quiet machine; if the debugger costs, ship two libhermesvm builds and load the debugger one only for --inspect.
- ZN-773.08: Hermes's DevTools agent does not report which breakpoint was hit and lists possible breakpoints as empty: check Chrome DevTools' breakpoint UI on Hermes.
- ZN-773.08: zinc export of a Hermes or V8 project should prefer the downloaded pack over the module beside a source-built zinc, whose library points at the local SDK.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc export (--dmg, --key, SBOM) and zinc pack/fuse accept jsc, v8 and hermes projects
- [ ] #2 zinc build --engine hermes precompiles .hbc
- [ ] #3 Export prefers the downloaded pack to the source-built module; Hermes handle scope growth checked on a long program
- [ ] #4 Hermes DevTools reports hit breakpoints
<!-- AC:END -->
