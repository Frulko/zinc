---
id: ZN-1028
title: 'zinc:net server limits and streaming bodies'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:37'
labels:
  - net
  - perf
  - size-M
milestone: m-14
dependencies: []
ordinal: 12500
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A per-server body-size option (64 MiB x 32 connections is the memory ceiling on a Pi), streaming the `fetch` bodyFile from disk instead of reading it whole, `sendfile` for `Reply.file`, and dual-stack listening or documented ZINC_BIND.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-842: a per-server body-size option in zinc:net; 64 MiB times 32 connections is the memory ceiling on a Pi or a reMarkable.
- ZN-892: sendfile for Reply.file; dual-stack listening by default; ZINC_BIND documented but not implemented in serve; per-listener IP buckets; a uv_fs pool for file replies.
- ZN-906: the fetch bodyFile row still reads the whole file into memory in the host; stream it from disk.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `serve({maxBody})` refuses a larger body with 413
- [ ] #2 `fetch` with bodyFile streams a 500 MB file with flat RSS
- [ ] #3 `Reply.file` uses sendfile on macOS and Linux
<!-- AC:END -->
