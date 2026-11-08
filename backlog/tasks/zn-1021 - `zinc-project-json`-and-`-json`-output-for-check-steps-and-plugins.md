---
id: ZN-1021
title: '`zinc project --json` and `--json` output for check, steps and plugins'
status: Backlog
assignee: []
created_date: '2026-11-07 16:36'
labels:
  - cli
  - tools
  - size-S
milestone: m-10
dependencies: []
ordinal: 1013000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Atelier parses CLI text and reads zinc.json as text. Give the CLI a stable machine form: `zinc project --json` (name, app, targets, permissions in force, plugins used, with comments in zinc.json handled), and `--json` on `zinc check` (diagnostics) and `zinc plugins`. Atelier switches to it.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-736: a `zinc project --json` that prints the parsed project (name, app, targets, permissions in force, plugins used), so Atelier stops reading zinc.json as text (a zinc.json with comments or a BOM shows the plain-sketch card); from the card: the app's id, the icon (a file dialog), the entry, per-target sizes, Build App for another target and for a paired device; Tab does not go from the width to the height field; Show Folder was not run on a desktop.
- ZN-774.06: Atelier should read a `--json` form of the CLI's output (diagnostics, steps, the plugins table) instead of parsing text, now that the CLI translates its messages.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc project --json <dir>` prints the parsed project, valid JSON, for a zinc.json with comments
- [ ] #2 `zinc check --json` prints diagnostics (code, file, line, column, message, fix)
- [ ] #3 Atelier reads these instead of text (one T1 smoke)
- [ ] #4 docs/guide notes the format
<!-- AC:END -->
