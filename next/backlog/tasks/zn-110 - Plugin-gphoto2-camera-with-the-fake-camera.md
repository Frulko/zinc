---
id: ZN-110
title: 'Plugin: gphoto2 camera with the fake camera'
status: Backlog
assignee: []
created_date: '2026-10-06 22:56'
labels:
  - plugins
  - size-M
milestone: m-9
dependencies:
  - ZN-101
  - ZN-072
  - ZN-075
ordinal: 40520
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Keep libgphoto2 (LGPL, dynamic) and libjpeg-turbo for the real path; the ZINC_FAKE_CAMERA fake of the prototype is the CI path (no physical camera needed). Promise completions from the worker thread via the ABI post queue.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fake-camera session: connect, capture, download, live view frames, all through promises
- [ ] #2 examples/camera/{cli,bench,remote} run headless with ZINC_FAKE_CAMERA=1
<!-- AC:END -->
