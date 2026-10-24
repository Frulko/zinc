---
id: ZN-054
title: 'Windows host: T0/T1 green in CI and zinc run --target esp32 from Windows'
status: Review
assignee: []
created_date: '2026-10-06 16:42'
updated_date: '2026-10-25 01:53'
labels:
  - size-L
  - parked
  - windows
dependencies: []
ordinal: 97600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** Keep AC1 (Windows only) and AC3; AC2 (Linux) is done. First phase of the cross-platform pass. Already there: .github/workflows/zinc-next.yml; git log ea1837a9 4fc7f02c.

Port the host side: toolchain pins for Windows (zig, esptool, QEMU), serial ports, SDL, paths, the CI matrix (macOS, Linux, Windows) running T0 and T1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 T0 and T1 pass on Windows and Linux in CI
- [ ] #2 zinc build --target aarch64-linux works from each host
- [ ] #3 zinc run --target esp32 works from each host (emulator at least)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Linux verified in an ubuntu:24.04 aarch64 container: T0, T1, T2 pass (oracle tests skip via exit 77 + tools/oracle --available); build warning-free on gcc; -ffp-contract=off everywhere (pinball AOT diff on gcc); QEMU missing-library message; ZINC_TEST_HOME; CI workflow written, not run. Windows not ported (doc lists the work). ACs left open: Windows, CI.
Review 2026-10-25: done-partly. Linux verified in a container (T0-T2), CI workflow exists in .github/workflows/zinc-next.yml and Windows builds exist (commits ea1837a9, 8133059a); left: T0/T1 green on Windows in CI, esp32 emulator from each host. Evidence: .github/workflows/zinc-next.yml; git log ea1837a9 4fc7f02c
<!-- SECTION:NOTES:END -->
