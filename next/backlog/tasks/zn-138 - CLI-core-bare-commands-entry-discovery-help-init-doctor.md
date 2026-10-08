---
id: ZN-138
title: 'CLI core: bare commands, entry discovery, help, init, doctor'
status: Review
assignee: []
created_date: '2026-10-06 23:01'
updated_date: '2026-10-08 00:52'
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
- [x] #1 T0 for each command; `zinc doctor` on a clean machine lists the pinned tools it will download
- [ ] #2 audit 01 CLI rows 'core' pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. src/cli_core.{h,cpp}: bare zinc run|build|check in a project (zinc.json entry, else src/main.ts[x]; build writes build/<name>), zinc help [command] and <command> --help (13 commands with usage lines), zinc init <dir> [--template game|cli|server|iot|remarkable] (zinc.json, src, assets, tsconfig, .gitignore, README), zinc doctor (engine, renderer tier, the pinned tools of tc with SHA-256 and installed/will-be-downloaded, host tools, plugin count). tests/t0/cli_core.sh. AC1 ticked. AC2 (audit 01 CLI rows 'core') partial: check --json, infer, dev, test flags, export/deploy, plugins listing options and the run --headless/--debug flags are other rows and stay open; CLI11 was not adopted: the argument shapes are still hand-parsed, the help table is the single place to extend.
<!-- SECTION:NOTES:END -->
