---
id: ZN-633
title: >-
  zinc:devtools on Zinc Next: inspector port from ZINC_DEVTOOLS_PORT or
  plugins.devtools.port
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 14:27'
updated_date: '2026-10-10 16:45'
labels:
  - devtools
  - size-S
milestone: m-20
dependencies: []
ordinal: 50200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Zinc Next listens on 9229 only, so the socket, dev_mode and netlog tests cannot run in parallel and netlog.sh skips (77) when 9229 is busy. (Follow-up of ZN-370, D60.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 two programs are inspected at once on different ports
- [x] #2 netlog.sh and socket.sh use their own port and run together
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done in a parallel worktree (branch worktree-agent-a0700e36f27b616d0).

What changed
- plugins/devtools/native/cdp.next.ts: the inspector listens on ZINC_DEVTOOLS_PORT when it is set, else on the port the plugin asks for (9229). 0 takes any free port (the line 'zinc devtools: ...' on stderr names it). The network log is started with the port really in use, so the program's own connections to its inspector stay out of the log on any port (index.ts no longer passes '9229').
- src/cli_core.cpp: devtoolsPort(entry) = ZINC_DEVTOOLS_PORT, else zinc.json plugins.devtools.port (targets.<host>.plugins.devtools over it, merged by frontend::pluginOptions). zinc run exports it as ZINC_DEVTOOLS_PORT before the program starts (interpreted, compiled and dev-bundle runs inherit it); zinc dev prints the port in 'started with the inspector on port N'.
- Tests: new tests/t0/devtools_port.sh; tests/free_ports.py prints free loopback ports; netlog.sh takes 5 free ports (HTTP, HTTPS, MQTT, quit, inspector) and no longer skips when 9229 is busy; socket.sh runs devtools.tsx on a free port (golden devtools.out says PORT); t1 dev_mode.sh gives its UI project a free port through zinc.json and probes it.
- docs/dev-mode.md: the variable wins, 0 takes a free port.

Decision (no record number, for the coordinator): the port reaches the Zinc stand-in as an environment variable set by the CLI, the way zinc.json keyboard, scheme, webgl and dev.perfHud already do (ZINC_KEYBOARD...), instead of a new mechanism that would give every x.next.ts the options of its plugin at compile time. Why: one consumer today, the variable is already the documented way to run two programs, and it needs no change in the module loader. Put in cli_core.cpp (discoverEntry, where --har becomes ZINC_HAR) and not next to the other setenv calls of main.cpp, which the loop has open. Limits: a board file's plugins.devtools is not read (discoverEntry has no engine root); an executable made by zinc build does not bake plugins.devtools.port (it reads ZINC_DEVTOOLS_PORT at run time).

Proof (development Mac)
- AC1: tests/run --only devtools_port -> PASS; run directly: 'devtools_port: ok (zinc.json 64995, ZINC_DEVTOOLS_PORT 64996)': one project started twice, both alive, tools/cdp-probe reads #document on each port; the variable wins over zinc.json.
- AC2: netlog.sh and socket.sh started in the same second, both exit 0 ('netlog rc=0 ended 18:43:34', 'socket started 18:43:32' / 'socket rc=0 ended 18:43:34'); each alone: PASS netlog, PASS socket.
- Also: PASS dev_mode (t1, the port from zinc.json under zinc dev), PASS cli_core.

Not proven: no run with the loop's tests at the same time in another tree (same code path as the two-test run). tests/run --changed falls back to most of t0/t1 (cli_core.cpp), so the tests were picked by hand.

For the coordinator
- affected.json: add devtools_port to the row of ../plugins/devtools/, and a row {paths: [tests/free_ports.py], tests: [devtools_port, netlog, socket, dev_mode]}.
- Follow-up (size S): tests/golden/host/socket.ts binds the fixed UDP ports 9731 and 9732: two trees running socket.sh in the same 100 ms can still collide; take them from udp(0) or from arguments. AC: socket.sh passes twice at once.
- Follow-up (size S, optional): zinc build bakes zinc.json plugins.devtools.port into a program that imports zinc:devtools (today only the variable changes the port of a built executable). AC: a built program with plugins.devtools.port 9300 listens on 9300 without the variable.

usage: n/a (tools/usage)
<!-- SECTION:NOTES:END -->
