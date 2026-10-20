---
id: ZN-163
title: Class components in React JSX mode and record literal assignability
status: Done
assignee: []
created_date: '2026-10-07 02:24'
updated_date: '2026-10-08 01:28'
labels:
  - language
  - size-M
milestone: m-13
dependencies:
  - ZN-077
ordinal: 101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
examples/inferno-todo needs two things ZN-077 left: JSX class components in React mode (_cc(v, () => new Tag(props), 'Tag', key) as in compiler/src/jsx.ts, 'class TodoItem used as a value' today) and the assignment of an object literal array to an interface-of-fields array (todos.ts: '{ id, text, done }[]' to 'Todo[]').
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 examples/inferno-todo runs 3 headless frames and exits 0 (added to tests/t1/examples.sh)
- [x] #2 a fixture covers a class component with props, state and a re-render in React mode
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Class components in the React model: jsx.cpp lowers <Tag/> to _cc(v, () => new Tag({props}), 'Tag', key) for classes declared in the file or in a relatively imported file (modules.cpp classTagsOf); a conditional whose branches are an object-literal shape and a declared interface joins to the declared type (check.cpp), so todos.map(t => c ? {…} : t) is Todo[]. examples/inferno-todo compiles and runs; tests/t0/react_class.sh + tests/golden/react (props, state, setState, re-render).
<!-- SECTION:NOTES:END -->
