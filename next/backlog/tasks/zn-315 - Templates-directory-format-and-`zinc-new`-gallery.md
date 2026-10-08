---
id: ZN-315
title: 'Templates: directory format and `zinc new` gallery'
status: Backlog
assignee: []
created_date: '2026-10-08 14:19'
labels:
  - templates
  - cli
  - size-M
milestone: m-19
dependencies: []
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner's request 2026-10-08 (LOVE2D-like kickstarts). Today `zinc init --template` writes one source string per template from src/cli_core.cpp. Move templates to `templates/<name>/` (any files, assets, tests) with `template.json` (name, description, tags, targets, variables such as {{name}} and {{id}}); `zinc new [template] <dir>` and `zinc new --list`; `zinc init --template` stays as an alias.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc new --list` prints every template with its description and targets
- [ ] #2 `zinc new <template> <dir>` fills the variables and the created project passes `zinc check` and `zinc test`
- [ ] #3 an unknown template or a non-empty directory is refused with the list of choices; the five current templates are migrated byte for byte
<!-- AC:END -->
