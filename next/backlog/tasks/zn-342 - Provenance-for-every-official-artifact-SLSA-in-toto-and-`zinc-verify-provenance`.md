---
id: ZN-342
title: >-
  Provenance for every official artifact (SLSA / in-toto) and `zinc verify
  --provenance`
status: Backlog
assignee: []
created_date: '2026-10-08 14:34'
labels:
  - distribution
  - security
  - ci
  - size-S
milestone: m-19
dependencies:
  - ZN-338
ordinal: 55330
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Each official artifact (zinc packages, plugin binaries, templates) carries a provenance statement: repository, commit, workflow, source hash, toolchain pins, builder. Use GitHub's artifact attestations (actions/attest-build-provenance) or in-toto statements signed with our key; `zinc verify --provenance <file>` checks it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 every artifact of a release has a provenance statement that `zinc verify --provenance` accepts
- [ ] #2 a statement for another commit or a changed artifact fails verification
<!-- AC:END -->
