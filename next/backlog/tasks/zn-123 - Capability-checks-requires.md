---
id: ZN-123
title: Capability checks (requires)
status: Done
assignee: []
created_date: '2026-10-06 22:59'
updated_date: '2026-10-07 13:48'
labels:
  - profiles
  - size-S
milestone: m-11
dependencies:
  - ZN-100
  - ZN-120
ordinal: 40650
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Read targets/capabilities.json; `requires` of zinc.json, plugin.json, `@requires` comments and `// zinc-test:` lines; diagnostics Z5003/Z5004/Z5005 with the prototype's messages.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 hero is refused on the esp32 profile with the old message; sqlite is refused on heap under 4M; ffi on rmpp
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. zinc.json requires refused on run with the old message (hero on esp32), plugin requires Z5005 (sqlite on esp32, ffi on rmpp), --force turns both into warnings; tests/t1/requires.sh + checker fixture. Not done: Z5004 @requires module warning.
<!-- SECTION:NOTES:END -->
