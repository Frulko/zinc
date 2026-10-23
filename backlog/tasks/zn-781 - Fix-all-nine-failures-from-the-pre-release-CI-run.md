---
id: ZN-781
title: Fix all nine failures from the pre-release CI run
status: Review
assignee: []
created_date: '2026-10-23 11:49'
updated_date: '2026-10-23 12:11'
labels:
  - tooling
  - ci
  - size-M
dependencies: []
ordinal: 517460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner requests correcting all nine failing tests of run 39939275942 (b7b1a3e4): i18n, atelier_tour, tour, guide_store, lexer, native_gen, plugin_manifest, examples_all and notify_relay. Diagnose root causes, preserve frozen references and strict checks, verify affected tests locally without publishing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Localization, Atelier/terminal tours and distribution guide tests pass, including the CI environment conditions that caused failures.
- [x] #2 Lexer, native ABI, plugin table and example inventory expectations are reconciled with intentional changes while preserving frozen prototype references.
- [ ] #3 Notification relay regression passes with meaningful coverage and deterministic fixture synchronization; no tests touch the real tablet.
- [ ] #4 All nine affected checks pass locally or have exact verified evidence for CI-only conditions; notes, changelog where applicable, and final commit are complete without pushing or publishing.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Eight failing checks have concrete fixes: locale tests isolate LANGUAGE/LC_ALL/LC_MESSAGES; tour stamps before checking to avoid losing a concurrent save; guide_store reads help --all and mem is registered/documented with five translated summaries; frozen lexer input restored as a separate source snapshot; exact device additions and network row checked separately against unchanged historical baselines; example runner honors the selected project engine and records Fatty/Kanban as OK. All nine originally failing tests now pass locally, including the complete examples_all inventory. Additional examples_status, cli_core and ci_plan pass. Native zinc rebuilt; locales tested under LC_ALL=C LANGUAGE=en. Native/generated header/mobile syntax checks, JSON/shell/Python checks pass; no frozen golden or corpus file changed. notify_relay also passed the original integration with the exact build-macos-arm64 artifact from run 39939275942. Its archived CI stall remains unexplained and is NOT claimed fixed: isolated Messages DB path, fail-fast reporting and database/relay/tablet diagnostics are added; a forced diagnostic-path check passed. See docs/reports/ci-pre-release-2026-10-23.md. Review pending a fresh hosted run confirming capture; owner next: git push && gh workflow run zinc-next --ref develop. No push/dispatch/publication or cross-target build done. Read-only investigations delegated per RULES section 8; no real tablet or owner app touched.
<!-- SECTION:NOTES:END -->
