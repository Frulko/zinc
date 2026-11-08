---
id: ZN-1021
title: '`zinc project --json` and `--json` output for check, steps and plugins'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:36'
updated_date: '2026-11-08 20:34'
labels:
  - cli
  - tools
  - size-S
milestone: m-10
dependencies: []
ordinal: 3700
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
- [x] #1 `zinc project --json <dir>` prints the parsed project, valid JSON, for a zinc.json with comments
- [x] #2 `zinc check --json` prints diagnostics (code, file, line, column, message, fix)
- [x] #3 Atelier reads these instead of text (one T1 smoke)
- [x] #4 docs/guide notes the format
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worker, 2026-11-08).
- zinc project --json [dir]: one document, format 1 (dir, manifest, name, id, version, icon, entry as written, main = the file zinc run starts, engine, profile, assets, shell, publicKey, permissionsDeclared, permissions, requires, targets in file order with the permissions in force there, plugins the program loads (parsed module graph, no native build), warnings). A refused zinc.json: {error} and exit 1; no zinc.json: manifest false. parseProject now skips a byte order mark (comments and trailing commas were already allowed).
- zinc check --json [file|dir], --json anywhere on the line: the LSP fields kept (uri, range 0-based, code, severity, message English, D159) plus file, line, column 1-based, fix (registry) and text (the message in ZINC_LANG). Still a top-level array (zinc lsp and tests/lsp compare it). A JavaScript program goes to the QuickJS check, which prints text.
- zinc plugins [dir] --json: {format 1, plugins [{name, module, kind, targets, description, dir}], problems}.
- Atelier: the card reads zinc project --json (async, the newest read wins), plugins from it; check() reads check --json (text fallback for the QuickJS check); the library list reads plugins --json. model.ts: projectFromJson, diagnosticsFromJson; importsOf removed; ws() skips a BOM and comments so edits of a commented zinc.json work.
- Steps (log::step lines) have no --json form: left out (not in the criteria), a later.md line.
- Proof: tests/run --only atelier, diagnostics, project, cli_core pass; a headless Atelier run of the atelier_ide project session on a zinc.json with a BOM and a comment prints the card, allows tray and renames (scratchpad smoke).
- Research: cargo metadata --format-version 1 (one document, pinned format; https://doc.rust-lang.org/cargo/reference/external-tools.html), rustc JSON diagnostics with spans and suggested replacements (https://doc.rust-lang.org/rustc/json.html), eslint --format json (array per file, 1-based line/column, exit 1 on errors; https://eslint.org/docs/latest/use/formatters/), deno lint --json ({version, diagnostics}). Kept: a format number, JSON on stdout only, keys added never renamed.
Proposed tests: tests/t1/atelier_ide.sh (the project card, the plain sketch, goldens unchanged expected), tests/t1/lsp.sh.
<!-- SECTION:NOTES:END -->
