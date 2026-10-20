---
id: ZN-346
title: 'Trust policy: official only, verified, community; prebuilt allowed or not'
status: Done
assignee: []
created_date: '2026-10-08 14:34'
updated_date: '2026-10-09 05:40'
labels:
  - distribution
  - security
  - size-S
milestone: m-19
dependencies:
  - ZN-340
  - ZN-337
ordinal: 55370
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One policy in zinc.json, the user config or the system (for companies and CI): accepted tiers, prebuilt binaries allowed or source only, rebuild threshold N, transparency required, allowed mirrors.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 each policy key has a test that changes what gets installed
- [x] #2 a system policy cannot be loosened by a project's zinc.json
- [x] #3 `zinc doctor` prints the effective policy and where each value comes from
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
src/tc/policy.{h,cpp}: tiers, prebuilt, rebuilds, transparency (auto | required), mirrors; layers system (/etc/zinc/policy.json or ZINC_SYSTEM_POLICY), user (~/.zinc/policy.json, ZINC_PREBUILT, ZINC_REBUILDS_MIN), project (zinc.json policy), each only tightening; a value's origin is the layer that narrowed it. Applied: mirrors() keeps only allowed mirrors; fetchPrebuilt honours prebuilt, the official / verified tiers, rebuilds and transparency required (no log key: built); zinc add and install refuse a tier the policy excludes, naming where it comes from; loaded by add, install, plugin-build and the run/build path. zinc doctor prints the effective policy with origins. tests/t1/trust_policy.sh: one change in what is installed per key, a system policy the project cannot loosen, doctor's origins; tests/t0/policy.sh: layering (project cannot lower the user's rebuilds, user narrows the system's mirrors). Fixed before commit: a double strs() call compared iterators of two vectors. tests/run --changed 68 pass. usage: n/a
<!-- SECTION:NOTES:END -->
