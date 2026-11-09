---
id: ZN-1104
title: Preserve default icons in composed QuickJS galleries
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 21:47'
labels:
  - ui
  - qjs
  - size-M
milestone: m-32
dependencies: []
ordinal: 1022
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks ZN-1078.11 final default-icon proof on current real gallery after Picker integration9dc934f5f. Feedback worker removed only default-only fixture/gallery manifest names, retaining real custom circle-alert. Exact fixtures/native/default Alert+Spinner pass without manifest, but full gallery QuickJS light/dark warns/misses info/circle-check/triangle-alert/loader-circle/folder-open. Manifest omitted/empty also fails; explicit custom names only change count ofmissingdefaults. Original full gallery interpreter compiles77files3364functions and runs3frames with no warnings. Copied full gallery with render target FeedbackSection still fails if original unused App body remains; deleting that body with imports/Header/Section/useQuietTheme unchanged succeeds. Individual family imports and simple ScrollView/Header/env-Show/Section wrappers succeed. Exact logs/reduced inputs .worktrees/1078-feedback-proof/.logs/feedback-proof/. Read-only source: src/qjs/qjs.cpp77-91 discoverIcons silently returns empty on program/check/lower diagnostics; nativeContractsOnly=true differs from normal compilation. Expose the actual diagnostic temporarily during debugging, fix its root generically, then preserve deliberate arbitrary-JS fallback. No restoring a default-icon manifest, no app composition workaround. Existing1090 defaults are independently proven; this is a new actual composition regression. Same sole core worker1101 can take as second priority afterCWD, before1103 size and1102 result-method parity, total4-taskbatch. No suite, bounded exact regression and actual gallery.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Valid fully composed Zinc programs retain reached library-default icons in QuickJS even when they also contain an unused large App body, with explicit, empty or absent custom manifests
- [ ] #2 Minimize and fix the actual discovery load/check/lower/reachability failure, preserving unsupported-arbitrary-JavaScript fallback, worker/stage isolation, no-icon lazy loading and offline behavior without application manifests or component-specific rules
- [ ] #3 Add the exact composition regression and prove original Feedback gallery light/dark/defaults plus existing library_icons across all3; every selected SVG keeps valid geometry/metadata and unchanged size budgets remain enforced
<!-- AC:END -->
