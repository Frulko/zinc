---
id: ZN-1004
title: 'Say what to write: errors for silent no-ops in zinc:ui'
status: Backlog
assignee: []
created_date: '2026-11-07 16:33'
labels:
  - ux
  - diagnostics
  - size-M
milestone: m-10
dependencies: []
ordinal: 2600
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Several mistakes draw nothing or fail with a message the user cannot act on: a percent width built as a template string, a style object imported from another file ("cannot read property length"), a string colour in a runtime style, a renamed Lucide icon name (draws nothing), `<Button icon>` when a local Button shadows the host one, an audio/3d import on a profile without it (Z0101 `__T7`), a Pressable `style={fn}` naming `styleFn`. Each gets a diagnostic or a runtime warning that names the fix and the closest valid name.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- zinc:ui: a width given as a string decided at run time (`width: `${n}%``) is not read as a percent; `pct(n)` is the way, and the diagnostic could say so.
- jsx: a style object built in another file (`style={tokens.card(on)}` imported) is not lowered (only the file's own functions and constants are); on QuickJS it fails as "cannot read property 'length' of undefined" in setStyles: say "a style must be a style object or StyleSheet entry" there.
- QuickJS: a string colour in a runtime style (`ui.setNumber(n, 'backgroundColor', '#fff')`, `color: someString`) is ignored without a word.
- icons: `<Icon name="trash-2">` with a name Lucide renamed (now `trash`) draws nothing and says nothing; warn with the closest name.
- ZN-853: a component declared in a file with the name of a host component (`function Button`) renders the host one (the kits rely on it: kit/button.tsx wraps `<Button>`); its error "unknown attribute 'icon' on <Button>" should say so and name the fix (rename it).
- ZN-754: zinc:audio and zinc:3d have no psp/ps2 target: importing them under those profiles fails with Z0101 '__T7' instead of a "not available on this target" message; a silent audio backend would let games run before console audio arrives.
- ZN-774.18: Pressable takes `style` and `children` functions only as inline arrows; `style={fn}` fails to type-check with an error naming `styleFn`, a name the user never wrote: a union prop type, or a clear error.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `<Icon name="trash-2">` prints a warning with the closest name (`trash`)
- [ ] #2 a `${n}%` width and a string colour in a runtime style warn once with `pct(n)` / the colour spelling
- [ ] #3 the shadowed-Button error names the rename; the Z0101 message says "not available on this target"
- [ ] #4 `zinc explain` entries and a T0 test for each
<!-- AC:END -->
