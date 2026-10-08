---
id: ZN-323
title: SBOM and third-party licences in every package
status: Backlog
assignee: []
created_date: '2026-10-08 14:19'
labels:
  - security
  - packaging
  - size-S
milestone: m-19
dependencies: []
ordinal: 55080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`zinc export` writes sbom.spdx.json (engine, vendored libraries, plugins, with versions, licences and sha256 from third_party/README.md) and THIRD-PARTY-LICENSES.txt with the licence texts of what the app actually links.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the SBOM validates against the SPDX 2.3 schema
- [ ] #2 an app without the sqlite plugin has no sqlite entry; one with it has it
- [ ] #3 the licence file holds the full text of every listed licence
<!-- AC:END -->
