---
id: ZN-059
title: 'Plugin manifest: default entry index.ts'
status: Done
assignee: []
created_date: '2026-10-06 22:48'
updated_date: '2026-10-06 23:20'
labels:
  - plugins
  - size-S
milestone: m-13
dependencies: []
ordinal: 40010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
plugins/pixelfont/plugin.json and the display-* manifests have no "entry"; readPluginsIn (src/frontend/modules.cpp) requires one, so `import ... from 'zinc:pixelfont'` fails (Z0119) and 5 examples are blocked. The prototype (compiler/src/plugins.ts) defaults to index.ts. Default it, and read the manifest with a real JSON parser (vendor yyjson now, see docs/reports/parity/04-library-choices.md) instead of the substring search.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `import { drawText } from 'zinc:pixelfont'` compiles; examples/boards/s3-matrix/text-scroller, scrollphat/{badge,cpu-graph,snake} and led/scroll-text pass the module resolution step
- [x] #2 all 33 plugin.json files of plugins/ load; an unknown key warns once
- [x] #3 third_party/yyjson vendored with licence, pinned version and checksum, README row added; T0 test for the manifest reader
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. yyjson 0.13.0 vendored; src/frontend/plugin_manifest.{h,cpp} (typed manifest, unknown key warning, wrong type error naming the file); readPluginsIn uses it, entry defaults to index.ts; zinc plugins [dir] lists plugins; T0 plugin_manifest.sh. 32 manifests load (the task said 33: there are 32). pixelfont resolves; the five board/led examples get past module resolution (their next blockers: ZN process API, x! — other tasks).
<!-- SECTION:NOTES:END -->
