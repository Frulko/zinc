---
id: ZN-076
title: Bare imports through tsconfig paths and lib/compat
status: Done
assignee: []
created_date: '2026-10-06 22:51'
updated_date: '2026-10-07 02:17'
labels:
  - language
  - modules
  - size-M
milestone: m-13
dependencies:
  - ZN-059
ordinal: 40180
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The loader rejects every non-relative non-zinc: specifier. The prototype resolves `inferno`, `solid-js`, `@pocketjs/framework/*`, `three` through each example's tsconfig.json `compilerOptions.paths` to lib/compat/* and plugins/three. Honour `paths` and `baseUrl` of the nearest tsconfig.json (parsed with yyjson), treat lib/compat/** as ordinary sources, support index resolution and extensions .ts/.tsx/.js/.mjs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 fixtures with a tsconfig and aliases; examples/inferno-todo and pocket-hero resolve every import
- [x] #2 a clear Z0119 message names the alias that failed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. frontend/tsconfig.{h,cpp} (yyjson, comments and trailing commas allowed) reads paths and baseUrl of the nearest tsconfig.json; the loader maps bare specifiers (exact and one-star patterns), resolves .ts/.tsx/.js/.mjs and index files and a .js specifier served by a .ts file; Z0119 names the alias and the paths tried. pocket-hero now checks clean; inferno-todo resolves every import (it stops on <VirtualList> JSX, another task). Not done: tsconfig extends.
<!-- SECTION:NOTES:END -->
