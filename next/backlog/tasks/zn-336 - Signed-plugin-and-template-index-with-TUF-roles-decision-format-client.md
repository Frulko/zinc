---
id: ZN-336
title: 'Signed plugin and template index with TUF roles (decision, format, client)'
status: Backlog
assignee: []
created_date: '2026-10-08 14:34'
labels:
  - distribution
  - security
  - size-L
milestone: m-19
dependencies:
  - ZN-331
ordinal: 55270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The list of plugins and templates (name, versions, sources, publisher key, targets, capabilities, artifact hashes). Metadata in the roles of The Update Framework (root, targets, snapshot, timestamp; expiry; signature thresholds; delegations to publishers) so a mirror cannot replay an old index, freeze updates or mix versions. RULES section 3: score vendoring a TUF client (python-tuf, go-tuf, tuf-cpp candidates) against a minimal C++ client of the TUF format over our Ed25519 (src/tc), record the decision, implement it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 decision record in docs/reports/zinc-next-decisions.md with the scores and the evidence
- [ ] #2 the TUF attack tests refuse: an expired timestamp, a rolled-back snapshot, a target whose hash differs, a role signed below threshold, a key not delegated for that name
- [ ] #3 the index is published on GitHub Pages by CI and `zinc plugins search <word>` lists its entries
<!-- AC:END -->
