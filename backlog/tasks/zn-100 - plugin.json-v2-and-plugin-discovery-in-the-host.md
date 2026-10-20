---
id: ZN-100
title: plugin.json v2 and plugin discovery in the host
status: Done
assignee: []
created_date: '2026-10-06 22:55'
updated_date: '2026-10-07 07:52'
labels:
  - plugins
  - size-S
milestone: m-9
dependencies:
  - ZN-059
ordinal: 40420
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full manifest per docs/reports/parity/03 section 3: entry, native specs, per-target sources and defines, options mapped to ZP_* defines, requires, libs (system/pkg-config), kind display; search path as today (plugins/ of the engine and of the project); `zinc plugins` listing with verified capabilities.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 all 33 manifests load; unknown keys warn once; `zinc plugins` output equals the prototype's fields
- [x] #2 options of zinc.json reach the plugin (3d.scale)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. PluginManifest now types options, per-target build settings (sources pkg frameworks libs linkFlags defines flags packages idf idfComponents nodeFlags) and the v2 keys (abi native sim deterministic threads license link); unknown keys, also inside targets, warn once. discoverPlugins/listPlugins reproduce the prototype's search path (engine, project, pluginDirs; project shadows) and its table byte for byte (tests/data/plugins-table.txt); 32 manifests + the greet sample load. pluginOptions/pluginDefines merge plugin.json < zinc.json plugins < targets.<t>.plugins (+ board file and display options) into ZP_<PLUGIN>_<KEY>=v and ZP_<PLUGIN>=1; 'zinc plugins <dir> --defines <plugin> [target]' prints them (3d.scale=2 verified). The defines are consumed by the plugin build of ZN-101. describePlugins is no longer used by the CLI.
<!-- SECTION:NOTES:END -->
