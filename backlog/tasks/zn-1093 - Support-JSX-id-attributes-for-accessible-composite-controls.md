---
id: ZN-1093
title: Support JSX id attributes for accessible composite controls
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 16:23'
updated_date: '2026-11-09 16:38'
labels:
  - ui
  - frontend
  - size-S
milestone: m-32
dependencies: []
ordinal: 1011.5
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks ZN-1078.12 Data grid. Minimal repro /tmp/zinc-id-1093/main.tsx: three lines import Solid render and View id="cell-1" => Z0005 unknown attribute id on View. Existing aria-* generic attribute pipeline can carry id; no data-grid-specific registry. Research from Data subagent: https://www.w3.org/TR/wai-aria/#aria-activedescendant and https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#kbd_focus_activedescendant require a unique descendant IDREF with composite focus and scrolling; https://react.dev/reference/react-dom/components/common documents standard id string and aria props. Preserve shared UI/core and all3 engines; sole core writer handles after1088, before1090. Existing opaque script dependency correction remains1088 scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Literal and reactive id attributes work on JSX host nodes and VirtualList in both UI models, stored as the same generic attribute across engines
- [x] #2 Small exact regression covers id updates, aria-activedescendant relationships and sibling identifiers without changing refs or unknown-attribute diagnostics
- [ ] #3 Original Data grid check and a short relevant host feature proof pass; no app workaround is kept
<!-- AC:END -->

## Private source checkpoint — 2026-11-09

Status **Backlog**, all criteria open until runtime proof. Coordinator authorized this separate task checkpoint while another owner's Mapper run holds the shared heavy-command queue; source is complete, no integration or Done claim.

- Reused the existing generic string-attribute pipeline: host JSX accepts id through kWebAttrs, VirtualList's separate lowering emits attr:id with literal/reactive support, both UI models already send that through ui.setAttr. Internal numeric node IDs and refs are unchanged.
- DOM host explicitly forwards the semantic ID and removes it when cleared; generic attr storage alone would not have reached the actual element. Updated editor host/VirtualList typings and semantic-hint docs. No Data/Picker code workaround or component-name registry.
- Exact jsx_id regression written for both Solid and React on interpreter/AOT/QuickJS: literal/reactive/cleared host and VirtualList IDs, sibling IDs, aria-activedescendant matching, unchanged refs and numeric node handles. Unknown host and VirtualList attributes still must raise Z0005. Tests are mapped in affected.json.
- Primary guidance read before implementation: WAI-ARIA keyboard-interface active-descendant guidance (https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#kbd_focus_activedescendant) and React common props (https://react.dev/reference/react-dom/components/common). IDs are semantic identifiers; the existing ref remains the program's handle.
- Static `git diff --check`, shell syntax and bounded `node --check targets/web/dom.js` PASS. No C++ build or runtime check started after these edits. No own process or queued build remains.

### Remaining exact proof

- Build own warm zinc target after the current source unit. Run `tests/t0/jsx_id.sh` through work-run with PATH timeout shim, own ZINC and ZINC_ROOT; six short headless runs plus invalid-attribute checks.
- Check unchanged Data grid/barrel and EmojiPicker callers using their worker source trees. Data also requires ZN-1094 flatMap; do not mark this AC from a parser-only improvement while that independent gap remains. Run one short original accessible-grid/Picker feature proof.
- Only then tick criteria and fold proof/criteria into this private task commit.

### Proposed tests and limits

- Browser DOM/assistive-technology interaction and native host accessibility behavior remain owner-chosen milestone checks; static DOM forwarding and generic attribute-store proof do not imply VoiceOver validation. No browser/window suite, cross build, T1/T2/demo, pixel comparison or benchmark run.

### Source review fixup

Read-only review found that ordinary optional IDs could be stringified as "undefined"/"null" on host nodes and forwarded raw by VirtualList. Both ID paths now normalize nullish values with `?? ''` before string conversion, evaluating the expression once; unrelated semantic hints are unchanged. Regression now drives typed string|undefined host IDs, string|null VirtualList IDs and explicit empty strings, preserving the same refs/handles. This remains unbuilt/unrun until the final queued proof.

### Warm build and exact proof

Own warm zinc build and exact `tests/t0/jsx_id.sh` PASS for both UI models on interpreter/AOT/QuickJS, including optional undefined/null clearing, VirtualList, unchanged refs, active-descendant relationships and invalid-attribute diagnostics. Retained log `.logs/core-proof/jsx_id.log`. AC1/2 proven. Original Data caller check/short proof AC3 remains pending alongside ZN-1094/1095. Static DOM forwarding is not a browser/assistive-technology validation claim.
