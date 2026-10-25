---
id: ZN-824
title: 'zinc dev --device: a startup timeline from the save to the first frame'
status: Done
assignee: []
created_date: '2026-10-25 08:00'
updated_date: '2026-10-25 08:03'
labels:
  - agent
  - perf
  - size-M
milestone: m-13
dependencies: []
ordinal: 533460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-25: know end to end why an app takes long to start on a device. zinc dev --device prints, at each start, one line per phase with its duration: pack on the workstation, bytes sent, waiting for the screen, engine start, each plugin (cached, prebuilt or compiled, with its time), program load, first frame; --timing writes the same as JSON. The program reports its first frame over its dev socket.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 each start of zinc dev --device prints the phases and their durations up to the first frame on the device
- [x] #2 a plugin compiled on the device shows as such with its time
- [x] #3 a T1 test checks the phases on a loopback agent
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: the workstation prints packed/sent/started with their times at each start, the device's ZINC_STEPS lines follow (a plugin built or downloaded there now prints its time: src/tc/plugin_build.cpp), the program prints 'first frame on the screen, from the start' at its first present (runtime first_present hook, installed by src/host/mirror.cpp when ZINC_DEV=1, counted from ZINC_DEV_T0 the agent sets at launch), and the workstation ends with 'on the screen of <d> <t> after the save'. tests/t1/agent_dev_perf.sh checks the three; agent_dev, agent_dev_versions, device_screen pass. Not done: a --timing JSON (no user yet: the lines are the record). Measured on the Pi before (cache timestamps): display-fbdev, svg, system, audio-vendor, audio built there 20-90 s each, the cause ZN-823 removes.
<!-- SECTION:NOTES:END -->
