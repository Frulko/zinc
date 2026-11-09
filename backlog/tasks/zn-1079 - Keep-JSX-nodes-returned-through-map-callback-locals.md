---
id: ZN-1079
title: Keep JSX nodes returned through map callback locals
status: Done
assignee: []
created_date: '2026-11-09 10:41'
updated_date: '2026-11-09 11:12'
labels:
  - ui
  - frontend
  - size-S
milestone: m-32
dependencies: []
type: bug
ordinal: 1025
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks the command palette in examples/ui/kit-gallery (ZN-1078.04). A valid block-bodied map callback returns a local JSX node; its children are drawn as numeric handles (for example 231,234) instead of mounting the rows. Direct JSX-returning map callbacks work. Preserve the original component code and fix the shared lowering/JSX provenance in every engine; no component wrapper or expression-body workaround.

Minimal main.tsx:

```tsx
import { render } from 'zinc:ui/solid';
function App(): i32 {
  return <View className="flex-col p-4">
    {['Save', 'Export'].map((label: string) => {
      const row = <Button className="h-9 bg-zinc-200"><Text>{label}</Text></Button>;
      return row;
    })}
  </View>;
}
render(App, 0xffffff, null);
```

Initial evidence: the Actions worker inspected docs/img/kit-command-palette.png from a headless QuickJS run; final reduced interpreter/AOT/QuickJS evidence belongs in this task notes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A block-bodied map returning a local JSX node mounts the expected children instead of printing handles on interpreter, AOT and QuickJS
- [x] #2 A narrow T0 regression covers local-node returns and preserves ordinary numeric-array text children
- [x] #3 The original kit-gallery command palette renders its command rows without a local workaround
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reduced proof (Actions worker, 2026-11-09): original 12-line program ran headless on the clean develop smoke binary with interpreter and QuickJS; both exited 0 but visually drew the exact text `3,5`, not the Save/Export buttons. Shots `/tmp/zn-map-interp.png`, `/tmp/zn-map-qjs.png`; source `/tmp/zn-actions-map-repro/main.tsx` is copied above. Ordinary numeric arrays must continue rendering as text: preserve node provenance, do not treat every i32 array as handles. AOT proof and focused regression remain for the assigned worker.

Research: [TypeScript JSX](https://www.typescriptlang.org/docs/handbook/jsx.html) and [Babel's JSX transform](https://babeljs.io/docs/babel-plugin-transform-react-jsx) lower JSX at its expression site; moving that value through a declaration/return does not change it. [React createElement](https://react.dev/reference/react/createElement) distinguishes elements from numeric text children. Zinc uses numeric node handles, so keep that distinction in shared lowering rather than treating every number array as nodes. No dependency is needed.

Implemented in the frontend JSX pass shared by typed interpreter/AOT and QuickJS: block-bodied arrows use the existing function-body return classifier; JSX-value recognition follows node locals. Provenance is keyed by declaration token and resolved through enclosing scopes, so unrelated same-name locals and shadowing parameters remain numeric. Returns inside nested functions cannot classify their enclosing callback as a node callback. Captured outer nodes and later assignments keep their existing path. No runtime, UI library or gallery source change.

Proof: `tools/build zinc` completed; the final incremental build was warning-free (the initial clean build reported existing warnings in untouched agent/dev.cpp and nanosvg). `timeout 45 build/zinc check /tmp/zn-actions-map-repro/main.tsx` and the regression fixture check passed. `ZINC="$PWD/build/zinc" timeout 180 tests/run --only jsx_map_local` passed: Solid and React, each on interpreter and QuickJS, compare drawn scene text for original local-node rows, direct JSX, a captured outer node, same-name numeric locals/parameters in block and expression bodies, an unused nested JSX function, and ordinary numeric arrays.

The unedited 12-line reproducer from the Description ran for two headless frames on `--interp`, `--engine quickjs` and explicit `--native`. Each scene dump draws exactly `Save` and `Export`; all three captures were inspected (`/tmp/zn-1079-{interp,qjs,native}.png`). The native log confirms C++ generation, native compilation/link and native execution. No component wrapper or expression-body workaround. The final resolver-only follow-up for expression-body parameter shadowing rebuilt warning-free and passed the same exact T0 once more. No suite, benchmark or cross-platform run. Usage: n/a.

Original gallery proof (Actions worker): in `/Users/mowmow/Lab/zinc/.worktrees/1078-actions`, `ZINC_ROOT=$PWD GALLERY=palette ZINC_HEADLESS=1 ZINC_FRAMES=40 ZINC_SCALE=1 ZINC_SHOT=$PWD/docs/img/kit-command-palette.png tools/compat/timeout 10 /Users/mowmow/Lab/zinc/.worktrees/1079-jsx/build/zinc run examples/ui/kit-gallery --engine quickjs` exited 0. The inspected shot shows the search field, `Save document` and `Export PDF`, with no numeric handles. The original block map (`const h = <Button ...>`, `rows.push(h)`, `return h`) was unchanged. Expanded `kit_actions` T0 passed on interpreter and QuickJS with the same binary.

Proposed tests (owner milestone; not run):
- `ZINC=<integrated>/build/zinc timeout 180 tests/run --only jsx_gaps`: broader JSX children/imports/conditionals in both models and all engines; roughly 10–30 s, memory not measured.
- `ZINC_HEADLESS=1 ZINC_FRAMES=2 timeout 120 <integrated>/build/zinc run --native tests/data/jsx_map_local/main.tsx`: extend all scoped numeric-local assertions to explicit native AOT; roughly 5 s cold, memory not measured.

Coordinator integration: 4004c3b7e on develop; clean retained smoke tree rebuilt, jsx_map_local and original two-frame interpreter screenshot passed. Broader/native shadow checks listed in RESUME.md.
<!-- SECTION:NOTES:END -->
