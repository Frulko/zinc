---
id: ZN-862
title: 'Trieur: native demos and a photo library manager'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-29 23:21'
updated_date: '2026-10-30 00:00'
labels:
  - demo
  - ui
dependencies: []
ordinal: 566460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-30): run the web library trieur (~/Lab/trieur, vendored unchanged in third_party/trieur by tools/sync-trieur) natively on Zinc, fill the engine gaps it meets (in the engine or in plugins), port its demos, and build a full photo library manager: one or more source folders, sorted into the same or another output folder, a trash, pretty icons, animations and colours.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 trieur's core and learn sources run unchanged (QuickJS engine)
- [ ] #2 A zinc:ui deck component reproduces the gesture: drag, fling, tap a zone, keys, undo, multi-zone, suggestion
- [ ] #3 Several demos port the site's examples
- [ ] #4 A photo manager demo: source folders, output folder, move/copy, trash, thumbnails, EXIF, model suggestions
- [ ] #5 Engine and plugin gaps fixed with tests; T1 test for the photo demo
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Engine and plugin gaps for the photo manager (worktree agent, commits 0ae583201, 5e92078e0, e77c64d6c):
- zinc:imageio (plugins/imageio, docs/plugins/imageio.md): info() header only with EXIF/GPS; thumbnail()/load() on up to 4 worker threads, newest first, cancel(path), on-disk thumbnail cache keyed by path+size+mtime(ns)+side under dataDir()/cache/thumbnails; ImageIO on macOS/iOS, stb_image + zinc's libwebp + TinyEXIF elsewhere. QuickJS: the native side never calls back; index.ts polls finished() on an 8 ms timer while requests wait (same pattern as zinc:photos), so it runs unchanged on every engine. Deterministic runs: portable reader first, and finished() waits for the workers so results land on a fixed frame. Measured: 24 thumbnails of 24 MP JPEGs 0.54 s (ImageIO, timers never late > 4 ms), 2.8 s portable, 10 ms from the cache.
- EXIF reader choice (portable path): TinyEXIF 1.2.0 (MIT, maintained, fuzzed, easyexif's parser plus lens/GPS/XMP; XMP off so no tinyxml2) over easyexif (BSD, unmaintained since 2016, same parser, fewer fields), libexif (LGPL, large, C API, more than needed) and a hand-written tag reader (AGENTS.md: proven library first). Vendored in plugins/imageio/vendor with PIN.
- zinc:system/opener trash(path): boolean: NSFileManager trashItemAtURL on macOS live; freedesktop.org home trash on Linux and in the simulator (deterministic/headless runs, XDG_DATA_HOME); false on Windows, phones, web.
- zinc:fs copyFile keeps mtime/atime and mode (utimes, chmod); rename stays Node-like (EXDEV across disks): copy then remove.
- Tests: tests/t1/imageio.sh (portable, ImageIO, QuickJS; pixels; cache read back), tests/t1/file_trash.sh (interp + QuickJS).
<!-- SECTION:NOTES:END -->
