---
id: ZN-1004
title: 'Say what to write: errors for silent no-ops in zinc:ui'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:33'
updated_date: '2026-11-08 20:03'
labels:
  - ux
  - diagnostics
  - size-M
milestone: m-10
dependencies: []
ordinal: 2600
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
- [x] #1 `<Icon name="trash-2">` prints a warning with the closest name (`trash`)
- [x] #2 a `${n}%` width and a string colour in a runtime style warn once with `pct(n)` / the colour spelling
- [x] #3 the shadowed-Button error names the rename; the Z0101 message says "not available on this target"
- [x] #4 `zinc explain` entries and a T0 test for each
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-08 (worktree agent).
- Research: React DOM warnValidStyle warns once per name/value with a Set and says 'Did you mean'; TypeScript getSpellingSuggestion / rustc find_best_match_for_name use edit distance about len/3 (zinc's nearest() already does). Lucide 1.x keeps renamed names as extra exports (lucide-static.mjs: 'export { default as Trash, default as Trash2 } from ./icons/trash.mjs'; repo icons/trash.json 'aliases': [{name: trash-2, deprecated: true}], https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/trash.json, https://lucide.dev/guide/advanced/aliased-names).
- U0001 icons: third_party/lucide/aliases.json (260 old names, made from the pinned lucide-static 1.47.0 exports, see PIN). The zinc:icons/lucide generator (all three engines go through it) draws the new icon for an old name and warns 'icon trash-2 is an old Lucide name: write trash'; an unknown literal name (zinc.json, name="x", icon('x')) warns with the closest name; a name decided at run time not compiled in warns once from icons.tsx (the compiler's unknown names are passed as UNKNOWN so nothing is said twice). Literals inside name={...} expressions are not warned about at build time (they can be other strings).
- U0002/U0003: Style's constructor and setNumber warn once per property when a string reaches them (QuickJS): pct(n) for a percent, 0xrrggbb for a colour. Typed engines already stop at the value with Z0103 at the user's line (not changed).
- U0004: 'unknown attribute icon on <Button>' inside the file's own function Button now says it is zinc:ui's Button there and to rename the component.
- Z0101 '__T7' for zinc:audio/zinc:3d under psp/ps2: not reproduced; 'zinc run --interp --profile psp|ps2' of a program importing decode and mat4 prints its line. The ZN-754 review of 2026-10-25 already called that note stale.
- zinc explain U0001..U0004 (uiExplain in src/frontend/modules.cpp). T0 tests/t0/ui_say_what.sh (4.8 s) passes; tests/t1/icons.sh golden main.out gains the warning for its deliberate unknown name 'not-an-icon' (reason: the new U0001 warning).
- Behaviour change: carnet, carnet-nbe, discord, nuxt-ui and templates/desktop-app name trash-2, which drew nothing; it now draws the trash icon with a warning (renamed in ZN-671).
- Not done (not in the criteria): a style object imported from another file on QuickJS ('cannot read property length'), Pressable style={fn} naming styleFn. Proposed later.md lines in the final report.
- Proposed tests: tests/run --only rn_showcase, icons_expr; the nuxt-ui, carnet, discord frames (trash icon now drawn).
<!-- SECTION:NOTES:END -->
