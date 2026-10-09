---
id: ZN-351
title: 'Threat model and guide for distribution: publishers, mirrors, community'
status: Done
assignee: []
created_date: '2026-10-08 14:35'
updated_date: '2026-10-09 06:16'
labels:
  - distribution
  - security
  - docs
  - size-S
milestone: m-19
dependencies:
  - ZN-346
  - ZN-343
  - ZN-345
ordinal: 55420
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/guide/08-security.md and 07-distribution.md: what each tier guarantees, what a mirror or proxy can and cannot do, how to publish (keys, CI workflow, rebuilders), how to run a private index and mirror for a company, key rotation and incident response.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 every attack of the TUF tests and of D-transparency maps to a guarantee in the guide
- [ ] #2 a publisher can follow the guide from a new repository to a verified-community release with the reusable workflow
- [x] #3 the guide is linked from `zinc help add`
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
08-security: 'Supply chain' rewritten for Next (pinned toolchains, components and SBOM, reproducible builds) and a new 'Plugin distribution: threat model and guarantees': who is trusted for what; an attack table (freeze, rollback, arbitrary package / mix and match, stolen key below threshold, out-of-scope publisher, quiet malicious release, revoked key or version, unrebuilt binary, community takeover, capability creep, changed archive, policy loosening) each with zinc's answer and its test; what mirrors and proxies can and cannot do; publishing steps (community, verified, rebuilders); a private index and mirror for a company; key rotation; incident response. 07-distribution links it; zinc help add points to it. tests/t0/security_guide.sh: cited tests exist, the TUF and log attacks are in the table, help links the guide. AC 2 needs ZN-338's reusable workflow: ZN-351.01. tests/run --changed pass. usage: n/a
<!-- SECTION:NOTES:END -->
