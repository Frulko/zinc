---
id: ZN-799
title: >-
  First-project polish: ui.d.ts, app.window without id, Button default, kit
  Input
status: Backlog
assignee: []
created_date: '2026-10-24 23:55'
labels:
  - size-M
milestone: m-17
dependencies: []
ordinal: 1400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-774.12: `zinc:ui` has no `.d.ts` (`lib/ui.d.ts` is a placeholder), so editors show beginners no `PointerEvent`, `KeyEvent` or event attributes: generate it from `lib/std/ui.ts`.
- ZN-774.12: `app.window` in `zinc.json` should not need `app.id`: a first project wants a window size, not a bundle id.
- ZN-774.12: a `Button` with no `bg-*` class is a dark box on a light page: let its default follow the page, or say so in `docs/ui-kit.md`.
- ZN-774.18: zinc:ui/kit has no Input or Textarea; kit apps style host fields by hand (shadcn's Input: h-9, rounded-md, border, px-3, text-sm).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lib/ui.d.ts is generated from lib/std/ui.ts and an editor shows PointerEvent, KeyEvent and event attributes
- [ ] #2 zinc.json app.window works without app.id
- [ ] #3 a Button with no bg-* follows the page, or docs/ui-kit.md says so
- [ ] #4 zinc:ui/kit has Input and Textarea in shadcn's shape, with a test and docs/ui-kit.md entry
<!-- AC:END -->
