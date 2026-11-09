---
id: ZN-1079
title: Keep JSX nodes returned through map callback locals
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 10:41'
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
- [ ] #1 A block-bodied map returning a local JSX node mounts the expected children instead of printing handles on interpreter, AOT and QuickJS
- [ ] #2 A narrow T0 regression covers local-node returns and preserves ordinary numeric-array text children
- [ ] #3 The original kit-gallery command palette renders its command rows without a local workaround
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reduced proof (Actions worker, 2026-11-09): original 12-line program ran headless on the clean develop smoke binary with interpreter and QuickJS; both exited 0 but visually drew the exact text `3,5`, not the Save/Export buttons. Shots `/tmp/zn-map-interp.png`, `/tmp/zn-map-qjs.png`; source `/tmp/zn-actions-map-repro/main.tsx` is copied above. Ordinary numeric arrays must continue rendering as text: preserve node provenance, do not treat every i32 array as handles. AOT proof and focused regression remain for the assigned worker.
<!-- SECTION:NOTES:END -->
