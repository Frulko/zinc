---
id: ZN-821
title: Remote debug and performance tools through the agent
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-25 07:50'
updated_date: '2026-10-25 08:26'
labels:
  - agent
  - perf
  - size-L
milestone: m-13
dependencies: []
ordinal: 530460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-25: from the workstation, start the debug and measuring tools on a device through its agent: the program's profile (zinc profile) and its trace brought back, the zbench render suite run there with its JSON brought back, the DevTools inspector of a dev session reached through the agent's forwarded port, a CPU/memory/temperature view (zinc device top) during a run.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc device <d> profile <app> runs it with the profiler and brings back the report
- [x] #2 zinc device <d> bench runs the zbench render suite there and writes its JSON here
- [x] #3 the DevTools inspector of zinc dev --device opens on the workstation (chrome://inspect)
- [x] #4 docs/guide names each tool
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-10-25). profile: zinc device <d> profile <app> [--frames 600] [-o trace.json] runs the installed app with ZINC_PROFILE=1, ZINC_TRACE=<agent home>/run/<app>.trace.json, ZINC_FRAMES=n, follows its log to the end (the summary), pulls the trace; the trace file there is emptied first (push of an empty file) so an app that writes none is reported, not confused with an older trace. The agent's info gives its home (new 'home' field). bench: zinc device <d> bench [zbench run options] runs tools/zbench run agent:<d> from the source tree (refused with the way out otherwise); zbench's Agent device deploys the suite with the new deploy --no-run (as the device needs: .zapp, export or sources), launches with run --env, pulls the report from <home>/run/zbench-report.json; zbench --out FILE writes the artifact elsewhere. Inspector: zinc dev --device packs a UI project with --inspect (not with --no-devtools, not the red box); the agent gives a session one ZINC_DEVTOOLS_PORT kept across restarts and returns it in its answer to start; the workstation forwards localhost:9229 (or a free port, said) to it for the session. Docs: docs/dev-mode.md 'Debug and measure on the device', docs/guide/06-testing.md 'On a device', zinc device usage and long help. Test: tests/t1/agent_tools.sh (about 6 s). Not proven: a real remote device (Pi, Linux) over the network; bench numbers there; Chrome itself attaching (the CDP /json/list answers on the forwarded port).
<!-- SECTION:NOTES:END -->
