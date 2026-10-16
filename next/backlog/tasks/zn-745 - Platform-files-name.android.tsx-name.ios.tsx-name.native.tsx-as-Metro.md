---
id: ZN-745
title: 'Platform files: name.android.tsx, name.ios.tsx, name.native.tsx, as Metro'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-16 14:28'
updated_date: '2026-10-16 21:04'
labels:
  - mobile
  - frontend
  - size-S
milestone: m-26
dependencies: []
ordinal: 196600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-16, while running examples/music (made for webOS) on Android unchanged: let a program carry code specific to the platform it is built for, the way React Native does (Metro's platform extensions). An import './Button' resolves, for the profile being built (currentProfile(): android, ios, webos, macos, linux, esp32, wasm...), to Button.<profile>.tsx / .ts first, then Button.native.tsx / .ts for every non-web profile (as React Native), then Button.tsx / .ts; same for index files and package entries. Today loadCandidate (src/frontend/modules.cpp:1549) tries only the plain names. The choice is made at compile time, so the other platforms' files are not compiled into the program (no dead code, no missing native module on a platform that lacks it). Editors and tsc follow it with tsconfig's moduleSuffixes ([".android", ".native", ""]), which zinc new/init write per target and zinc lsp honours. Complements Platform.OS / Platform.select (lib/std/react-native.tsx) and plugins' per-target native code; docs in docs/react-native.md and the guide.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a T0 test: one program with Screen.tsx, Screen.android.tsx, Screen.native.tsx and Screen.webos.ts prints a different line built for android, ios (native), webos and macos/linux (native) and wasm (plain); a missing platform file falls back without a diagnostic
- [ ] #2 zinc check --profile <p>, zinc build, zinc export --target android and the interpreter resolve the same file (one resolver)
- [ ] #3 zinc lsp go-to-definition from the import lands on the file of the current profile; templates write moduleSuffixes
- [ ] #4 docs: the rule, its order and an example in docs/react-native.md and the UI guide
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-16: the resolution of x.<profile>.ts / x.android.ts / x.ios.ts is in (zinc-f5, commit 640cb5fb; tests/t0/platform_files.sh for esp32 and the host, platform_identity.sh for android and ios, interpreter included). Left: the .native fallback for every non-web profile (as Metro), a test with Screen.native.tsx and Screen.webos.ts, zinc export android/ios resolving the same file, moduleSuffixes in the tsconfig that zinc new/init write and zinc lsp honouring it (AC3), docs in docs/react-native.md and the UI guide (AC4).
<!-- SECTION:NOTES:END -->
