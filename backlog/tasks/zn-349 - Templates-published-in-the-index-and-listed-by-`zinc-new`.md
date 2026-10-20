---
id: ZN-349
title: Templates published in the index and listed by `zinc new`
status: Done
assignee: []
created_date: '2026-10-08 14:34'
updated_date: '2026-10-09 05:55'
labels:
  - distribution
  - templates
  - size-S
milestone: m-19
dependencies:
  - ZN-336
  - ZN-315
  - ZN-316
ordinal: 55400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Templates (kind: template) go through the same index, signatures, tiers and lock as plugins; `zinc new` lists the official ones and those the policy allows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `zinc new` lists index templates with their tier
- [x] #2 a template from a community publisher follows the policy (refused under official-only)
- [x] #3 a template pins the plugins it needs in the generated zinc.lock
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
fromIndex takes a folder (plugins | templates). zinc new: an engine template is official; a name it does not have is looked up in the index (templates/<name>.json official, <publisher>/templates/<name>.json verified, per version too) and its source fetched (with its path inside the repository); a URL is community; the trust policy (system, user) refuses a tier it excludes before anything is fetched. zinc new --list adds the index's templates the policy accepts, with tier and publisher. template.json 'plugins' (a known key now): zinc new adds each like zinc add, so the new project has them in zinc.json dependencies and zinc.lock. tests/t1/templates_index.sh: --list with hello (official) and fancy (verified, acme); zinc new hello pins greet's commit in the new zinc.lock; official-only hides fancy and refuses a community URL; default accepts it. templates, templates_remote, templates_kickstart pass; tests/run --changed 55 pass. usage: n/a
<!-- SECTION:NOTES:END -->
