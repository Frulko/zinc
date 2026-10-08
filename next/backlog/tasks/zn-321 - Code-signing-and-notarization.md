---
id: ZN-321
title: Code signing and notarization
status: Backlog
assignee: []
created_date: '2026-10-08 14:19'
labels:
  - packaging
  - security
  - size-M
milestone: m-19
dependencies:
  - ZN-320
ordinal: 55060
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
macOS: `signing` in zinc.json (Developer ID identity, team), codesign with the hardened runtime and entitlements derived from the permissions, notarytool submit and staple; Linux: an ed25519 signature next to each artifact (the update keys). Submitting to Apple needs the owner's account: the task does everything up to that step and prints the exact command.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `codesign --verify --strict` and `spctl --assess` pass on an ad-hoc and on a test identity build
- [ ] #2 the entitlements follow the permission manifest (camera, network...)
- [ ] #3 Linux artifacts verify with `zinc verify`; a changed byte fails
<!-- AC:END -->
