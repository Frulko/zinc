---
id: ZN-343
title: 'Transparency log of publications (append-only, inclusion proofs)'
status: Done
assignee: []
created_date: '2026-10-08 14:34'
updated_date: '2026-10-09 05:16'
labels:
  - distribution
  - security
  - size-M
milestone: m-19
dependencies:
  - ZN-336
ordinal: 55340
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every publication (index change, artifact, key delegation) is appended to a public append-only Merkle log, so a signed but malicious release is visible. Decision (RULES section 4): Sigstore Rekor vs a small log on Pages; the client checks the inclusion proof of what it installs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 decision record with the scores
- [x] #2 an artifact without an inclusion proof is refused under the default policy
- [x] #3 a log that rewrites history (consistency proof fails) is detected
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done through ZN-343.01 (D42) and .02 (log, proofs, client policy). usage: n/a
<!-- SECTION:NOTES:END -->
