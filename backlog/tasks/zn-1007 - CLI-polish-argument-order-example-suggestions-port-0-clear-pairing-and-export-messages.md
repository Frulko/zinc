---
id: ZN-1007
title: >-
  CLI polish: argument order, example suggestions, port 0, clear pairing and
  export messages
status: Backlog
assignee: []
created_date: '2026-11-07 16:34'
labels:
  - cli
  - ux
  - size-S
milestone: m-10
dependencies: []
ordinal: 1000000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ten small first-run rough edges: `zinc run --engine quickjs file.tsx` prints the usage (options before the file); `zinc run <bare-word>` could suggest `example:<word>` (Z0119); devtools port 0 prints port 0 and `zinc dev` finds the port by closing it first; a wrong pairing code says "SSL alert"; `zinc dev --device` prints a forward error before falling back from 9229; `zinc export --target web` stops on a zinc.json name with spaces and takes a parent zinc.json for a folder without one; the window of a built app is named "zinc" without window.title; `zinc tour` text still describes the old `zinc new` question.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- cli: `zinc run --engine quickjs file.tsx` prints the usage; only `zinc run file.tsx --engine quickjs` works.
- ZN-733: `zinc build` and packaged apps still name their window "zinc" unless zinc.json sets window.title; old links stay in `~/.zinc/cache/run/names`: clear them with the run cache.
- ZN-821: when 9229 is taken, `zinc dev --device` prints the forward's "cannot listen on port 9229" before falling back; probe the port quietly first.
- devtools: with `ZINC_DEVTOOLS_PORT=0` the "zinc devtools:" line and zinc dev print port 0 instead of the port the system chose.
- zinc dev port 0: the port is found free then closed before the child binds it; the child choosing it and reporting it over the dev socket would close the gap.
- ZN-774.33: `zinc run <bare-word>` (Z0119) could suggest `example:<word>` when it names a catalogue entry.
- ZN-774: `zinc tour`'s help and step 1 still describe "the zinc new question" (src/cli_core.cpp tour row, cli.cmd.tour, src/cli_tour.cpp); `zinc new` asks nothing since ZN-774.32.
- ZN-774.36: `zinc export --target web` of a folder with no `zinc.json` takes a parent's (Atelier's sketches pick up Atelier's `requires fs`).
- Atelier/agent: pairing with a wrong code reports "SSL alert" instead of "wrong code"; map the TLS PSK failure to the plain message.
- ZN-908: `zinc export --target web` of app/atelier stops on the zinc.json name "Zinc Atelier"; take the file name from app.id or a slug.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc run --engine quickjs file.tsx` and `zinc run file.tsx --engine quickjs` both work
- [ ] #2 `zinc run hero` suggests `example:hero` when the catalogue has it
- [ ] #3 `ZINC_DEVTOOLS_PORT=0` prints the real port; a wrong pairing code prints "wrong code"
- [ ] #4 `zinc export --target web` of app/atelier works (slug from app.id) and ignores a parent zinc.json
- [ ] #5 a T0 test per message
<!-- AC:END -->
