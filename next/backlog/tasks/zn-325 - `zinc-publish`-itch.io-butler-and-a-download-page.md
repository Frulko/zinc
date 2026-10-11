---
id: ZN-325
title: '`zinc publish`: itch.io (butler) and a download page'
status: Done
assignee: []
created_date: '2026-10-08 14:19'
updated_date: '2026-10-11 08:32'
labels:
  - distribution
  - size-S
milestone: m-19
dependencies: []
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`zinc publish --itch user/game:channel` with the pinned butler (fetched on first use), and `--site dir` writing a static download page (one button per platform, checksums). Publishing is outward-facing: the task runs everything with --dry-run and records the command; the owner runs the real upload.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 --dry-run prints the butler commands for every exported target
- [x] #2 the download page lists each artifact with its sha256 and size
- [x] #3 butler is pinned and verified by checksum
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-10-11). zinc publish [dir] --itch user/game[:suffix] [--dry-run]: one butler push per export directory of dist/ (<name>-<target>: channels mac, linux, linux-rpi, linux-rpi1, linux-rpi2, linux-chip, linux-pocketchip, linux-rmpp, html5 for wasm; the suffix appended; --userversion from zinc.json app.version); --dry-run prints them and uploads nothing. --site <dir>: index.html with one button per artifact of dist/ (export directories as .tar.gz; .dmg, .deb, .AppImage, .zapp copied), each with its size and SHA-256, and SHA256SUMS. butler is pinned in src/tc/tc.cpp: 15.31.0 (2026-08-31; 15.32.0 is from 2026-10-05, too new), the four archives of broth.itch.zone (darwin-amd64/arm64, linux-amd64/arm64) downloaded and hashed for the pins; ensureButler fetches it once into ~/.zinc/toolchains/butler-<host>-15.31.0 (mirrors and ZINC_OFFLINE as the other tools), checks the SHA-256, unzips it; zinc doctor lists it. AC1-AC3: tests/t0/publish_store.sh (a project with made-up macOS and Linux exports and a .dmg: the dry run's two pushes with the suffix and version, no push for the installer; the page's sizes and hashes against shasum, SHA256SUMS checked; offline, a mirror serving another file is refused with 'does not verify (SHA-256 ..., the pin is ...)', nothing installed or pushed). Owner's step: `butler login` once, then `zinc export --target macos` (and the others), `zinc publish <dir> --itch <user>/<game> --dry-run`, then without --dry-run. Tests: publish_store, tc, mirrors, cli_core, cli_tools pass. usage: n/a
<!-- SECTION:NOTES:END -->
