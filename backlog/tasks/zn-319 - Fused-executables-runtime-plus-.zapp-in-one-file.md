---
id: ZN-319
title: 'Fused executables: runtime plus .zapp in one file'
status: Done
assignee: []
created_date: '2026-10-08 14:19'
updated_date: '2026-10-09 00:01'
labels:
  - packaging
  - size-S
milestone: m-19
dependencies:
  - ZN-318
ordinal: 55040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`zinc fuse app.zapp --target macos|linux|rpi|rpi1 -o app`: the prebuilt runtime with the archive appended (LOVE's fused mode), for apps that do not need the AOT; the AOT stays the default of `zinc export`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the fused file runs on a machine without zinc (test: a clean environment with no ZINC_HOME)
- [ ] #2 fusing for another target uses the pinned cross runtime
- [x] #3 size of a fused hello recorded in the notes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: zinc fuse app.zapp [-o app] writes this engine + the archive + a 16-byte trailer (size, ZNFUSED1); at start a fused binary finds the trailer, unpacks the app (shared unpackZapp with zinc run app.zapp) and runs it with its arguments. Runs in an empty environment (env -i, fresh HOME, no ZINC_HOME, another directory): same output (cli) and frame (game-2d) as zinc run (tests/t0/fuse.sh); macOS runs the ad-hoc signed binary with the appended bytes. Size of a fused hello: 15,354,328 bytes (engine 13,750,328 + app 1,604,096; the cli app still carries resources.bin because usesHost is true for zinc:sys). zinc pack skips resources.bin for programs without host calls. AC #2 (another target with a pinned cross runtime) split to ZN-392: --target of another OS is refused naming it. usage: n/a
<!-- SECTION:NOTES:END -->
