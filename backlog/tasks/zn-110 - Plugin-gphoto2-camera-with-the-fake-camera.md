---
id: ZN-110
title: 'Plugin: gphoto2 camera with the fake camera'
status: Done
assignee: []
created_date: '2026-10-06 22:56'
updated_date: '2026-10-07 10:29'
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
- [x] #1 fake-camera session: connect, capture, download, live view frames, all through promises
- [x] #2 examples/camera/{cli,bench,remote} run headless with ZINC_FAKE_CAMERA=1
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. gphoto2 builds natively (libgphoto2 + libturbojpeg via pkg-config) and the fake camera (ZINC_FAKE_CAMERA=1) session works through promises: detect, open, capture, download, live view frames (tests/golden/host/camera_session.ts, tests/t1/camera.sh); examples/camera/{cli,bench,remote} run headless (cli output checked: settings list, iso change and rejection, shutter file event, capture) and are OK in examples.lst. Needed: zrt::Promise support in thunks (done in ZN-104), plugin marked deterministic.
<!-- SECTION:NOTES:END -->
