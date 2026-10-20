---
id: ZN-729
title: 'Zinc agent: a device daemon and zinc device, adb over the network'
status: Backlog
assignee: []
created_date: '2026-10-12 13:38'
labels:
  - dev
  - agent
  - size-L
milestone: m-20
dependencies: []
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-12): a zinc daemon without a UI for Linux and macOS, so that a Zinc app such as Atelier (and the CLI) finds a target device in a secure way (Bonjour, an encrypted protocol, a code) and gets from it: telemetry, capabilities, the kind of device and its power, debugging, installation and remote deployment, capture, instrumentation, the inspector, a remote shell, hot reload and OTA updates. The equivalent of a complete adb, over the network. `zinc agent` is the daemon (adbd), `zinc device` the client (adb). Design: docs/reports/zinc-next-agent.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every subtask is Done
<!-- AC:END -->
