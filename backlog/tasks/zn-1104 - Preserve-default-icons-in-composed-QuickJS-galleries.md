---
id: ZN-1104
title: Preserve default icons in composed QuickJS galleries
status: Done
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
- [x] #1 Valid fully composed Zinc programs retain reached library-default icons in QuickJS even when they also contain an unused large App body, with explicit, empty or absent custom manifests
- [x] #2 Minimize and fix the actual discovery load/check/lower/reachability failure, preserving unsupported-arbitrary-JavaScript fallback, worker/stage isolation, no-icon lazy loading and offline behavior without application manifests or component-specific rules
- [x] #3 Add the exact composition regression and prove original Feedback gallery light/dark/defaults plus existing library_icons across all3; every selected SVG keeps valid geometry/metadata and unchanged size budgets remain enforced
<!-- AC:END -->

## Implementation notes

Short primary research: Rollup documents that aggressive side-effect assumptions can hide semantic issues (https://rollupjs.org/configuration-options/#treeshake). The read-only analysis must preserve normal module resolution rather than pruning an application body or guessing icons. No dependency or new discovery policy is needed.

Temporary diagnostics showed the probe failing at CHECK with Z0101: PickersSection not exported by sections/pickers. The composed module path had no extension, zero statements and zero exports. QuickJS readFile accepted a directory through ifstream and returned successful empty text; the resolver therefore selected the existing pickers/ directory before sibling pickers.tsx. The normal compiler and default ModuleResolver readers already refuse non-regular files, explaining the normal interpreter success. The QuickJS reader now does the same regular-file check with error_code; temporary diagnostics were removed. No icon catalog, reachability, arbitrary-JS fallback, worker/stage or application change.

A tiny regression retains an unused App body importing panels from sibling panels.tsx while panels/ exists and renders a library-default icon directly. It covers absent, empty and explicit custom manifests; unused apple stays omitted, custom heart retained, and every selected SVG parses. Existing library_icons still covers native/QuickJS/defaults, offline/stage/bundle, worker isolation and deliberate arbitrary-JS fallback.

Final proof: own warm tools/build zinc PASS. Expanded exact library_icons PASS with the new composition regression (absent manifest on interpreter/native/QuickJS, empty/custom on QuickJS), valid SVG parsing and existing offline/stage/bundle/worker/arbitrary-JS boundary cases. Feedback worker replayed the unchanged actual gallery on this candidate: light and dark show all default icons with noU0001, New project reaches Preview ready/Workshop created, and360px bottom-scrolled capture keeps every control/action contained. Evidence .worktrees/1078-feedback-proof/.logs/feedback-proof/*-final.* and narrow-bottom.*; candidate SHA2566d5e7007 is fully recorded in this tree's provenance.json. No composition or manifest workaround. The separate known combined kit size failure remains assigned1103; its thresholds are unchanged and still enforced, not claimed passing here. No runtime performance measurement, broad suite, benchmark or cross-target run. Existing broader module-resolution/platform and real-device accessibility sessions remain proposed milestone checks. No own process/queue remains.
