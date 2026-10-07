---
id: ZN-168
title: 'DynFunction: typed functions as dynamic host functions (checker adapter)'
status: Done
assignee: []
created_date: '2026-10-07 08:56'
updated_date: '2026-10-07 09:01'
labels:
  - frontend
milestone: m-9
dependencies: []
ordinal: 40420
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc:script's expose(name, fn: DynFunction) takes a typed function such as (r: i32, name: string) => void. The checker gives it an adapter (alias DynFunction in the Dyn prelude, check.cpp dynFunctionAdapter) that converts each argument JavaScript-style and boxes the result. Prerequisite of ZN-103.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. alias DynFunction = (args: unknown[]) => unknown in the Dyn prelude; check.cpp dynFunctionAdapter wraps a typed function (number kinds, string, boolean, unknown params; void/scalar/string/unknown result) in an adapter converting JavaScript-style; a lambda for a DynFunction keeps its own type. Test tests/t0/dyn_function.sh.
<!-- SECTION:NOTES:END -->
