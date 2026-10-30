---
id: ZN-906
title: 'examples/discord: file sending with limits, large-file transfer services'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 23:06'
labels:
  - net
  - ui
  - size-M
milestone: m-28
dependencies: []
ordinal: 600460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: send files with Discord's normal per-user limits (size by Nitro tier, count); when a file is larger, offer to send it through a transfer service (SwissTransfer, WeTransfer or similar with a public API) in an upload window with progress, then post the link; and a provider interface so a self-hostable sharing tool (e.g. PsiTransfer, Pingvin Share, transfer.sh) can be connected by URL and token. Research which services have usable APIs and their terms; never automate beyond the user's own upload.
<!-- SECTION:DESCRIPTION:END -->
