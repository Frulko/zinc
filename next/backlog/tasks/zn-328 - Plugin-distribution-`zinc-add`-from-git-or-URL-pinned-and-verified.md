---
id: ZN-328
title: 'Plugin distribution: `zinc add` from git or URL, pinned and verified'
status: Backlog
assignee: []
created_date: '2026-10-08 14:20'
updated_date: '2026-10-08 14:28'
labels:
  - plugins
  - distribution
  - security
  - size-L
milestone: m-19
dependencies: []
ordinal: 55200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today plugins are found locally (the engine's plugins/, the project's, pluginDirs) and their native part is built on demand (ZN-101); there is no way to fetch one. `zinc add <git-url|url|name>[@version]`: fetched into the project or a user cache, version and sha256 pinned in zinc.json (a lock section), signature checked when the source publishes one; optional prebuilt native libraries per target, else the local build. Reuses fetchTool (src/tc) and the update keys.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc add` from a local git repository and from a file:// archive pins the commit or sha256 in zinc.json; a second machine gets the same bytes
- [ ] #2 a changed archive (sha256 mismatch) or a bad signature is refused
- [ ] #3 a plugin with prebuilt libraries for the target uses them; without, it builds locally as today
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan from the background analysis (2026-10-08): (1) a signed index.json (same Ed25519 key as zinc update) on Pages: name, version, source (archive + sha256 or git + commit), targets, requires; zinc plugins search, zinc add <p>[@v] writing zinc.json and a zinc.lock with sha256, zinc install into ~/.zinc/plugins/<name>-<version> (added to the search path); templates can live in the same index (kind: template, ZN-315/316). (2) prebuilt binaries from CI per target (macos-arm64, linux-x86_64, linux-aarch64, armhf), keyed by the existing plugin cache hash of src/tc/plugin_build.cpp (sources, defines, flags, compiler, ABI headers, target): the client looks the hash up remotely, verifies the signature, else builds locally; needs the pinned zig as the default plugin compiler (today the system c++ wins), which also makes builds reproducible. (3) system libraries: vendored ones static; OS ones (EGL, DRM, GBM) dynamic against pinned sysroots per target (Debian bookworm/trixie, Pi OS), the missing-package message kept. (4) the engine composed: minimal zinc per arch from CI, WebGL/SDL3 as index plugins (ZN-330). (5) security: index and binaries signed, public key in zinc, zinc.lock pins sha256, zinc add shows the publisher and capabilities, an option forces local builds. Order: CI green (dc4d08f), zig default for plugins, binary cache, index + add/install/lock, sysroots, templates in the index. Pi GPU from a Mac needs (2)+(3); display-fbdev should already work, unverified on the board.
<!-- SECTION:NOTES:END -->
