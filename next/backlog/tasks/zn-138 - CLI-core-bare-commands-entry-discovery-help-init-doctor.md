---
id: ZN-138
title: 'CLI core: bare commands, entry discovery, help, init, doctor'
status: Backlog
assignee: []
created_date: '2026-10-06 23:01'
labels:
  - cli
  - size-M
milestone: m-10
dependencies:
  - ZN-078
ordinal: 40800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Table D of audit 01: `zinc check|build|run [entry]` without a file argument discovers src/main.ts[x] and zinc.json, `zinc help <cmd>` prints real usage (CLI11, BSD, for option parsing), `zinc init <template>` scaffolds (templates of the prototype), `zinc doctor` reports toolchain, SDL, simulators, plugin libraries and what to install; exit codes and messages follow docs/guide/01-getting-started.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 T0 for each command; `zinc doctor` on a clean machine lists the pinned tools it will download
- [ ] #2 audit 01 CLI rows 'core' pass
<!-- AC:END -->
