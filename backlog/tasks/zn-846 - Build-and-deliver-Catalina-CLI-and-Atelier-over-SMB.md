---
id: ZN-846
title: Build and deliver Catalina CLI and Atelier over SMB
status: Done
assignee: []
created_date: '2026-10-26 16:42'
updated_date: '2026-10-26 16:59'
labels:
  - macos
  - size-M
dependencies: []
ordinal: 555460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: deposit the Zinc CLI and Atelier on /Volumes/myrole/Desktop, a networked Intel Mac running macOS 10.15. Build actual x86_64 Catalina-targeted desktop binaries, package their resources and required plugins, smoke-test locally and verify the deposited files. Do not launch apps on the remote Mac.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The CLI and window module are compiled for x86_64 with a macOS 10.15 deployment target, with post-Catalina frameworks optional
- [x] #2 Self-contained CLI and Atelier payloads run locally without relying on checkout paths or an ARM plugin cache
- [x] #3 Artifacts are copied under a new directory on the requested Desktop and read-back checksums match
- [x] #4 Document reproduction, local checks and the remaining actual-Catalina launch verification
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built the actual desktop engine for x86_64 and macOS 10.15 in build/macos-catalina. Fixed mandatory linkage to macOS-11-only UniformTypeIdentifiers in the window module and AOT flags. Fixed loadPlugin writing exports into prebuilt directories (broke sealed apps), with regression in plugin_prebuilt. Built five native plugins with explicit Intel/10.15 Apple clang in an isolated home: system, process, audio, 3d, canvas2d. Reused tools/package payload/engine/launcher/plist helpers; retained only Atelier under app resources, excluded unrelated app data, omitted JSC (needs 10.15.4), V8/Hermes and WASM (existing host/slice assembly mismatch; later.md). App launcher uses --interp, so opening it needs no compiler. Tests macos_frameworks, atelier, plugin_prebuilt PASS. Staged CLI interpreter and QuickJS print Catalina CLI 42 from /tmp with empty caches and system-only PATH; both CLI/app resolve packaged resources. Packaged Atelier real background window capture visually reviewed; scripted session runs hello through embedded CLI; strict deep app signature passes before and after use. Audited 18 Mach-O files: Intel, minimum <=10.15, no workstation/Homebrew dylibs. Delivered ready-to-open app and cli/bin/zinc to /Volumes/myrole/Desktop/Zinc-macOS-10.15 with French instructions, binary audit, provenance and SHA256.json; all 2236 files read-back verified. Copy resumed with 8 I/O threads after stopping the owned slow sequential copy; partial files replaced atomically and final hashes verified. No program executed on the remote Mac, no system installation, notarization, push or publication. Actual Catalina launch remains for the owner. Report docs/reports/zinc-next-macos-catalina.md. Two existing resolve.cpp parentheses warnings left untouched. Other sessions changes untouched. Usage n/a for Codex.
<!-- SECTION:NOTES:END -->
