---
id: ZN-818
title: >-
  zinc device update --local: put this tree's engine on a device without a
  release
status: Done
assignee: []
created_date: '2026-10-25 07:50'
updated_date: '2026-10-25 07:58'
labels:
  - agent
  - size-M
milestone: m-13
dependencies: []
ordinal: 527460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-25: updating a device in dev mode should not need a release. zinc device <d> update --local cross-builds the engine for the device's system and architecture (tools/build-linux with the pinned zig), sends the package over the paired channel and installs it as the device's engine the way an OTA update does (versions/<ver>-<id>, current link, trial and roll back), marked as a local build. The paired TLS channel is the trust: no release signature is asked for a local package.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc device <d> update --local builds the package for the device's architecture when it is missing or older than the tree, sends it and switches the device to it
- [x] #2 zinc device <d> info names the engine as a local build (version and commit)
- [x] #3 a T1 test installs a local package on a loopback agent and checks the running engine
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: zinc device <d> update --local [package] builds this tree with tools/build-linux --arch <device arch> (or takes the package given), sends it (op engine), the agent unpacks it in <home>/engine, checks bin/zinc --version, and starts again in place through the installed binary, which hands over to the local engine (ZINC_AGENT_LOCAL names the installed one). On trial until it listens: a start that finds engine.trial sets the engine aside (engine.failed). info says localEngine; --local --remove goes back. The Pi player keeps the installed engine (the root updater and zinc-admin are untouched: no unsigned engine is ever run as root). tests/t1/agent_local_engine.sh (local engine serves, remove, broken engine set aside); agent_apps and agent_deploy pass. Not proven here: a real tools/build-linux aarch64 package on the Pi (needs the device to run an agent with this code first, i.e. one release).
<!-- SECTION:NOTES:END -->
