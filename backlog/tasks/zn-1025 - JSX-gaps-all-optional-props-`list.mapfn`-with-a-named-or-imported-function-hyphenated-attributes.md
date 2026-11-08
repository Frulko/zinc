---
id: ZN-1025
title: >-
  JSX gaps: all-optional props, `{list.map(fn)}` with a named or imported
  function, hyphenated attributes
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:36'
updated_date: '2026-11-08 20:23'
labels:
  - jsx
  - ui
  - size-M
milestone: m-13
dependencies: []
ordinal: 3800
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
- [x] #1 one JSX program with all nine cases compiles and renders the expected tree on the interpreter, AOT and QuickJS
- [x] #2 `zinc check` and the compiler agree on `{cond ? list.map(...) : <View />}`
- [x] #3 `aria-*` and `data-*` attributes pass through to components and host nodes
- [x] #4 the Discord workaround for `{list.map(fn)}` can be removed (lines marked in the code)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-08 (worker branch). Test: tests/t0/jsx_gaps.sh (tests/data/jsx_gaps) reads the texts the frame draws (ZINC_SCENE_DUMP + tools/scene-texts) in the React and the Solid model, on the interpreter, AOT and QuickJS: 6 runs pass. jsx, jsx_map_named, jsx_list_branch, jsx_narrow, jsx_null_component, jsx_react_narrow, jsx_style, jsx_banned, jsx_project_model and checker pass; `zinc check` over app/, examples/, templates/ gives the same results as before (notify-relay's Z0103 and the esp32 Z0119 are older).

Research: tsc and Babel write a dashed JSX attribute as a quoted key (`_jsx(Bar, {"aria-label": x})`, https://babeljs.io/docs/babel-plugin-transform-react-jsx); TypeScript's JSX handbook (https://www.typescriptlang.org/docs/handbook/jsx.html#attribute-type-checking): a dashed attribute name not declared by the props is not an error, and only required props make `<Bar />` an error.

How:
- `<Bar />`: a component with no attribute is called `Bar({})`, as JSX passes props (QuickJS read `p.label` of undefined before); the checker drops an empty `{}` given to a capitalised function that takes no parameter.
- `aria-*`/`data-*` on a component: a quoted key; a dashed key the props record does not declare is dropped by the checker (TypeScript's JSX rule). Host nodes already map aria-label to the label and data-* to attributes.
- `{list.map(fn)}` with an imported function: jsxClassTags (modules.cpp, also used by the QuickJS path in qjs/strip.cpp) now also reports the imported names that are functions returning JSX in a relative .tsx file (jsxFunctionNames), merged into the lowering's jsxFunctions.
- Solid `{cond ? list.map(...) : <View/>}` (check passed, compile failed with Z0005 this type in the IR): conditional() lowers a list branch into a fragment of its own (listAt factors the list detection of children()).
- `{p.children?.()}` printed the node id as text (the stray "18"/"12"): lowered as the conditional `p.children !== undefined ? p.children() : nothing`.
- `a?.b !== undefined` narrows `a` (every base before a `?.`) and the path `a.b` (pathKey through the optional chain), in JSX and plain code.
- Discord: the emoji picker maps `rows[i].items.map(emojiCell)` with a named function again (the inline component is gone); the lowering mounts it as rows (checked in ZN_DUMP_JSX); `zinc check examples/discord` passes.

Decision (no D number allocated in a worktree): a dashed key in an object literal passed where a record is expected is dropped silently when the record does not declare it; plain TypeScript would report it outside JSX. Accepted: only dashed names, which a record field can only have quoted.

Proposed tests: tests/demo of examples/discord (the picker), a T1 run of the Atelier and nuxt-ui sessions (every component call now passes `{}` when it has no attribute).
<!-- SECTION:NOTES:END -->
