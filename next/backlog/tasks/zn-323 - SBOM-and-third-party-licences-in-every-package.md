---
id: ZN-323
title: SBOM and third-party licences in every package
status: Done
assignee: []
created_date: '2026-10-08 14:19'
updated_date: '2026-10-09 01:07'
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
- [x] #1 the SBOM validates against the SPDX 2.3 schema
- [x] #2 an app without the sqlite plugin has no sqlite entry; one with it has it
- [x] #3 the licence file holds the full text of every listed licence
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: next/third_party/components.json (19 components: id, name, version, SPDX licence, url, sha256 where pinned, licence file or excerpt, scope runtime / host / rn / shaped / script / frontend / icons / plugin:<name>; font versions read from the TTFs). zinc build, when zinc export asks (ZINC_COMPONENTS=1), writes <exe>.components from its link command and plugins (host and cross builds); zinc export turns it into sbom.spdx.json (SPDX 2.3, yyjson: the app, the Zinc runtime, each component, DESCRIBES / DEPENDS_ON) and THIRD-PARTY-LICENSES.txt (full texts), created = SOURCE_DATE_EPOCH else the newest project source (so the .deb stays reproducible). Test tests/t1/sbom.sh: validates against the SPDX 2.3 schema (vendored tests/data/spdx-2.3.schema.json, sha256 239208b7...), SQLite only with zinc:sqlite, every licence in full, identical twice. Also: cross builds now inject the permissions too (ZN-322.03 follow-on: draws programs link the host), and ensureCrossLibs brings build/cross-* up to date incrementally (-j3) instead of building once (it was stale: permissions.cpp missing). permissions_export, installer_deb, installer_dmg, cli_tools pass; tests/run --changed 45/45. usage: n/a
<!-- SECTION:NOTES:END -->
