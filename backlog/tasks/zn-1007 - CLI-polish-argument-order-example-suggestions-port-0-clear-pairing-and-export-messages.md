---
id: ZN-1007
title: >-
  CLI polish: argument order, example suggestions, port 0, clear pairing and
  export messages
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:34'
updated_date: '2026-11-08 19:17'
labels:
  - cli
  - ux
  - size-S
milestone: m-10
dependencies: []
ordinal: 2000
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
- [x] #1 `zinc run --engine quickjs file.tsx` and `zinc run file.tsx --engine quickjs` both work
- [x] #2 `zinc run hero` suggests `example:hero` when the catalogue has it
- [x] #3 `ZINC_DEVTOOLS_PORT=0` prints the real port; a wrong pairing code prints "wrong code"
- [x] #4 `zinc export --target web` of app/atelier works (slug from app.id) and ignores a parent zinc.json
- [x] #5 a T0 test per message
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-08 (worktree agent): all ten lines handled.
- Argument order: discoverEntry moves an --engine named anywhere to right after the entry (main.cpp reads it at argv[3]); entryIndex() shared by discoverEntry and the example check.
- zinc run|dev|check|build <bare word>: when no such file or folder exists and learn/catalog.txt has that name, exit 2 with cli.examples.bare (did you mean 'example:<name>'?, the full command); other words keep Z0119.
- Port 0: already fixed by b974d2ce9 (the devtools line names the bound port; zinc dev learns it from the child over the dev socket, no probe-and-close gap). Checked: ZINC_DEVTOOLS_PORT=0 zinc run prints localhost:56339, zinc dev prints 'the inspector listens on port 56278'.
- Pairing: client maps a TLS failure of EC J-PAKE to 'wrong code: it is not the one the device shows (three wrong codes close the pairing: run zinc agent pair there for a new one)'; timeout and lost connection keep 'pairing failed: <why>'. Atelier's plain() already maps 'wrong code'. tests/t0/agent.sh checks 'wrong code: '.
- zinc dev --device: probes 127.0.0.1:9229 quietly (bind, close) before asking the forward for it; taken, it goes straight to any port.
- Export file name (decision): zinc.json name when it is a file name already, else the last part of app.id (Zinc Atelier / dev.zinc.atelier: atelier), else a slug of the name, else the entry's stem; the page keeps the name as its title (WebArgs.title). app/atelier exports to the web (26 files, <title>Zinc Atelier).
- Parent zinc.json: zinc export <dir> sets ZINC_PROJECT_ROOT; findProjectFile stops at that folder (fs::equivalent, /var vs /private/var). Today the web export of app/atelier/examples/bounce-canvas gave the same files in place and as a copy, but a native export runs zinc build, which climbed to Atelier's zinc.json (window, permissions, requires); proven with check --profile esp32 on a sketch under a parent requiring heap>=1G.
- Window title of zinc build: already done (main.cpp, the built program sets ZINC_APP_NAME from app.name/name, ZN-733); not re-proven here (an AOT build).
- zinc tour: help row, step comments, tests/t1/tour.sh comment and cli.tour.kind.ask (5 languages) name zinc new --pick.
Web search (clig.dev, cargo, deno, adb): clig.dev/#arguments-and-flags (order-independent flags), clig.dev/#errors (suggest the fix, do not auto-correct), Node net.Server port 0 (print the bound port), adb pair says 'wrong pairing code' not a TLS alert.
Tests run: tests/run --only cli_polish (new), agent, cli_core, zinc_i18n, i18n: all pass.
Proposed tests: tests/t1/dev_mode.sh (port 0 path, ~30 s, window-free); tests/t1/atelier_devices.sh (wrong-code text in the panel, ~20 s, opens a window); tests/t1/tour.sh (~4 s); zinc dev --device <paired device> with 9229 taken (by hand, needs a device: no 'cannot listen' line).
later.md lines: '- ZN-1007: tools/site-examples copies each sketch to a temp folder so it does not take Atelier zinc.json; zinc export <dir> now stops at the folder, the copy can go (keep the SKIP_DIRS filter).' and '- ZN-1007: zinc run <dir> of a folder without zinc.json still climbs to a parent zinc.json (window size, permissions); setting ZINC_PROJECT_ROOT in discoverEntry for a directory entry would match zinc export.' and '- ZN-733: old links stay in ~/.zinc/cache/run/names (one symlink per app name); nothing prunes them.'
<!-- SECTION:NOTES:END -->
