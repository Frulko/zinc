---
id: ZN-1025
title: >-
  JSX gaps: all-optional props, `{list.map(fn)}` with a named or imported
  function, hyphenated attributes
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:36'
labels:
  - jsx
  - ui
  - size-M
milestone: m-13
dependencies: []
ordinal: 3800
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A component whose props are all optional cannot be written `<Bar />` (Z0104); `{list.map(fn)}` with a named function returning JSX renders node ids as numbers and an imported fn is not seen as a list; `aria-label` on a function component or on `VirtualList` lowers to a syntax error; a JSX child `{cond ? list.map(...) : <View />}` checks but fails to compile; narrowing does not cross into a JSX expression; a component taking several children through `children?: () => i32` renders a stray 18. Fix the lowering and the checker in one pass, with one test file that holds every case.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-631: a custom component taking several children through children?: () => i32 rendered a stray "18" in the first Zinc Go home screen: look at the JSX lowering.
- Checker vs lowering: `zinc check` accepts a JSX child `{cond ? list.map(...) : <View />}` but compiling fails with "Z0005 this type in the IR"; check and compile must agree, and the mixed form should be supported.
- Narrowing does not carry into nested functions in general: in JSX `{x === undefined ? … : <Text>{x.toUpperCase()}</Text>}` still fails (the text is its own reactive function); an optional-chain condition does not narrow its root (`p?.children !== undefined ? p.children() : …` fails with Z0107).
- JSX: a component whose props are all optional cannot be written `<Bar />` (Z0104, no props object passed).
- Atelier: `<Row />` with every prop optional fails with Z0104 (a component whose props are all optional should take no attribute); fix in the checker, then drop the empty props Atelier passes.
- ZN-904: `{list.map(fn)}` with a named function returning JSX renders node ids as numbers (React accepts it): an engine gap the Discord pickers worked around with an inline component; fix it in the engine and undo the workaround.
- ZN-923: `aria-label` on `VirtualList` is rejected by the compiler (Z0005): engine gap, small.
- ZN-?: `.map(fn)` in JSX with a function imported from another file is not seen as a list of nodes (detection is per file, token level).
- mapper fleet: `aria-label` (any hyphenated attribute) on a component made of a function lowers to `{ aria-label: ... }`, a syntax error in generated code with the wrong column; quote the key or say the prop is unknown.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 one JSX program with all nine cases compiles and renders the expected tree on the interpreter, AOT and QuickJS
- [ ] #2 `zinc check` and the compiler agree on `{cond ? list.map(...) : <View />}`
- [ ] #3 `aria-*` and `data-*` attributes pass through to components and host nodes
- [ ] #4 the Discord workaround for `{list.map(fn)}` can be removed (lines marked in the code)
<!-- AC:END -->
