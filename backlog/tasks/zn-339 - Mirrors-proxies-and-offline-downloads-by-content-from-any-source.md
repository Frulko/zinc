---
id: ZN-339
title: 'Mirrors, proxies and offline: downloads by content from any source'
status: Done
assignee: []
created_date: '2026-10-08 14:34'
updated_date: '2026-10-09 04:53'
labels:
  - distribution
  - security
  - size-S
milestone: m-19
dependencies:
  - ZN-336
  - ZN-337
ordinal: 55300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every download (index files, plugins, templates, toolchains) is verified by hash and signature, so any server may serve it: a list of mirrors (`ZINC_MIRRORS`, zinc.json `mirrors`, the existing ZINC_TC_MIRROR folded in), HTTPS_PROXY and NO_PROXY honoured, and an offline mode that uses only the local cache.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a mirror that serves a modified archive is refused and the next mirror is tried
- [x] #2 through an HTTP proxy (test proxy) every download works
- [x] #3 `zinc install --offline` succeeds from a warm cache and names what is missing from a cold one
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done through ZN-339.01 (mirrors, proxies) and .02 (content cache, install --offline). App updates (fetchManifest, downloadUpdate) still download from their URL only (proxies apply). usage: n/a
<!-- SECTION:NOTES:END -->
