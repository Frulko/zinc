---
id: ZN-689
title: 'Checker: a node-valued call used as a JSX child prints its handle as a number'
status: Done
assignee: []
created_date: '2026-10-10 19:42'
updated_date: '2026-10-10 21:20'
labels:
  - checker
  - ui
  - bug
  - size-S
milestone: m-27
dependencies: []
ordinal: 450410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the museum editor: `{Part()}` as a JSX child, where Part returns a node, prints the node's handle as a number unless the function is named `children` or `renderX`. It should mount the node, or be refused with a message.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `{Part()}` mounts the returned node (test on the interpreter and the AOT), or the checker reports it with a Z code and a fix
- [x] #2 a regression program in tests/golden
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: the JSX lowering (src/frontend/jsx.cpp nodeCall) mounts a call used as a child when it gives a node: render functions as before, the functions of the same file that return JSX (function declarations or const arrows, found by a scan of the file's tokens), and components (a capitalised bare callee, except the global constructors String, Number, Boolean, Date...). A number or String(x) stays text. Regression: tests/golden/jsx/node_call.tsx/.out ({Part()}, {row('a')}, a fragment, {count()}, {String(7)}) in tests/t0/jsx.sh, interpreted and built. rn_showcase (its {Discover(...)} in <Show>), rn_tester, react_native, ui, nuxt_ui, kit_menubar, rn_port, museum_editor pass; prototype pixel goldens 40 of 42 (the two known 3D). A lowercase helper of another module that returns a node is still printed (the lowering sees one file): name it renderX or capitalise it. usage: n/a
<!-- SECTION:NOTES:END -->
