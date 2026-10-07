---
id: ZN-163
title: Class components in React JSX mode and record literal assignability
status: Backlog
assignee: []
created_date: '2026-10-07 02:24'
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
- [ ] #1 examples/inferno-todo runs 3 headless frames and exits 0 (added to tests/t1/examples.sh)
- [ ] #2 a fixture covers a class component with props, state and a re-render in React mode
<!-- AC:END -->
