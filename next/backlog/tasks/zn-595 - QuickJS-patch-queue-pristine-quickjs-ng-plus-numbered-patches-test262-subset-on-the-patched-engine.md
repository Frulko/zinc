---
id: ZN-595
title: >-
  QuickJS patch queue: pristine quickjs-ng plus numbered patches, test262 subset
  on the patched engine
status: Done
assignee: []
created_date: '2026-10-09 09:28'
updated_date: '2026-10-10 09:54'
labels:
  - perf
  - quickjs
  - size-S
milestone: m-21
dependencies:
  - ZN-139
priority: high
ordinal: 5610
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Before any engine change: keep third_party/quickjs-ng as the pristine 0.17.0 release and apply numbered patches from third_party/quickjs-ng/patches/ at configure time (or keep them applied with a check that the tree equals release + patches). Each patch has a header: purpose, measured gain, upstream PR link or 'not upstreamable' with the reason. The T1 QuickJS tests and the ZN-139 test262 subset run on the patched engine. Rebasing to a new quickjs-ng release is one documented command. (From docs/reports/quickjs-aot-jit-and-ffi.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 third_party/quickjs-ng/patches/ exists with a README; tools/ or CMake check that the vendored tree equals release + patches
- [x] #2 third_party/README.md and components.json name the patch queue
- [x] #3 the QuickJS T1 tests and the test262 subset pass on the patched engine; a dry rebase onto a newer quickjs-ng tag is documented
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Checked first: the vendored third_party/quickjs-ng is the v0.17.0 release unchanged (archive downloaded, sha256 559bc4c4... matches the pin; the 19 files are byte-identical), so the queue starts empty. Added: third_party/quickjs-ng/PRISTINE (release, archive URL and sha256, the SHA-256 of each vendored file), patches/README.md (numbering, header with Purpose / Measured / Upstream, how to add one, how to move to a new release), tools/quickjs-patches (check: reverse every patch on a copy, last to first, then compare with PRISTINE, offline; rebase <tag|commit> [--apply]: fetch the archive, apply the queue to its copy of the vendored files, report each patch, print the archive's sha256, write only with --apply), tests/t0/quickjs_patches.sh, affected.json mapping. Verified: a stray edit of quickjs.h fails the check ('quickjs.h: FAILED', exit 1); a demonstration patch of cutils.h applied in the tree and kept in patches/ passes; tools/quickjs-patches rebase master (v0.17.0 is the newest release): 7 of 19 vendored files differ on master, the demonstration patch applies (both reverted). third_party/README.md and components.json name the queue. AC#3: quickjs_patches, quickjs (includes its test262 run), test262_regexp and sbom PASS on the engine (unchanged, the queue being empty). Usage: n/a.
<!-- SECTION:NOTES:END -->
