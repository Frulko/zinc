---
id: ZN-315
title: 'Templates: directory format and `zinc new` gallery'
status: Done
assignee: []
created_date: '2026-10-08 14:19'
updated_date: '2026-10-08 23:14'
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
- [x] #1 `zinc new --list` prints every template with its description and targets
- [x] #2 `zinc new <template> <dir>` fills the variables and the created project passes `zinc check` and `zinc test`
- [x] #3 an unknown template or a non-empty directory is refused with the list of choices; the five current templates are migrated byte for byte
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: the five templates moved from src/cli_core.cpp to templates/<name>/ (beside lib/, shipped by tools/package) with template.json (name, description, tags, targets, entry, variables); zinc new [template] <dir>, zinc new --list, zinc init --template as the alias. {{name}} / {{id}} filled (JSON-escaped in .json files, files with a NUL byte copied as they are); tsconfig.json still written by the command (machine paths). Byte for byte: the files of the old zinc init are identical for the five templates (diff -r against a snapshot); each template gains tests/smoke.test.ts. zinc test without a directory now tests the project in the current directory (it ran the engine's conformance programs). Test tests/t0/templates.sh; cli_core, cli_tools, dev_mode pass; tests/run --changed 44/44. Docs: docs/templates.md (the root README is someone else's uncommitted work). usage: n/a
<!-- SECTION:NOTES:END -->
