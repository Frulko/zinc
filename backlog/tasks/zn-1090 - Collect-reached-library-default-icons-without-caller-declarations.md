---
id: ZN-1090
title: Collect reached library default icons without caller declarations
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 14:36'
labels:
  - ui
  - frontend
  - size-M
milestone: m-32
dependencies: []
type: bug
ordinal: 1011
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks Feedback defaults ZN-1078.11 and shared kit usage: .worktrees/1078-overlays-resume/.logs/feedback-icons-repro/main.tsx imports only Alert and Spinner from kit with no icons manifest; U0001 warns info and loader-circle, both render blank. Existing Selection check/minus defaults and PasswordField eye have the same library-owned asset boundary. Explicit icons lists in gallery fixtures are not a generic component fix. Do not copy SVG/glyphs or require every application to know internal kit icon names.

src/frontend/modules.cpp lucideModuleSource/iconModule scans only project roots before loading the generated icon data; inspect actual flow. Collect literal/default icons from reached library code, including real helper defaults, while preserving per-component shaking. Never bundle all standard-library or barrel-family icons to mask missing discovery. Keep dynamic application icon declarations/diagnostics and minified bundle/AOT behavior coherent. Existing lib/std/icons.tsx and pinned third_party/lucide are the provider, no new dependency or kit-specific compiler registry.

Primary research: Flutter IconData/staticIconProvider https://api.flutter.dev/flutter/widgets/IconData-class.html and https://api.flutter.dev/flutter/cupertino/staticIconProvider-constant.html illustrate static asset roots + icon shaking. These are alternatives to inspect, not a mandate to adopt font icons. Read existing Zinc source/reachability/resource baking and apply smallest general solution. Notes must identify what is proven for literal/default versus truly dynamic names. All heavy commands bounded, one target/exact regressions/short original scene, no broad suite.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Default icons of reached library components render without caller icons manifest on interpreter AOT QuickJS, including unchanged Alert/Spinner reproducer
- [ ] #2 Unused family icons are absent; dynamic caller declarations and unknown-name diagnostics remain compatible; unchanged kit_size budgets do not regress
- [ ] #3 Small exact asset regression plus original Feedback/default scene and relevant kit caller smoke pass, ownership/provenance/limits documented
<!-- AC:END -->
