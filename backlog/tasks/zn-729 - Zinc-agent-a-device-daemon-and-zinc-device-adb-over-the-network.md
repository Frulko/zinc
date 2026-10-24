---
id: ZN-729
title: 'Zinc agent: a device daemon and zinc device, adb over the network'
status: Done
assignee: []
created_date: '2026-10-12 13:38'
labels:
  - dev
  - agent
  - size-L
milestone: m-20
dependencies: []
ordinal: 64000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-12): a zinc daemon without a UI for Linux and macOS, so that a Zinc app such as Atelier (and the CLI) finds a target device in a secure way (Bonjour, an encrypted protocol, a code) and gets from it: telemetry, capabilities, the kind of device and its power, debugging, installation and remote deployment, capture, instrumentation, the inspector, a remote shell, hot reload and OTA updates. The equivalent of a complete adb, over the network. `zinc agent` is the daemon (adbd), `zinc device` the client (adb). Design: docs/reports/zinc-next-agent.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every subtask is Done
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: closed as Done. The only open child is ZN-729.04 (Review), whose last criterion is a real launchd load. Evidence: subtasks 729.01-.03,.05-.08 Done; src/agent; tests/t1/agent*.sh; CHANGELOG device agent Verifier: Subtasks 729.01-.03 and .05-.08 are Done; only ZN-729.04 (Review) is open. Apply after ZN-729.04 is closed so AC1 'every subtask is Done' is true.
<!-- SECTION:NOTES:END -->
