---
id: ZN-357
title: 'Showcase: a Nuxt UI-style kit and demo (ui.nuxt.com)'
status: Backlog
assignee: []
created_date: '2026-10-08 15:02'
updated_date: '2026-10-08 18:45'
labels:
  - ui
  - examples
  - style
  - kit
milestone: m-17
dependencies:
  - ZN-357.01
  - ZN-357.02
  - ZN-357.03
  - ZN-357.04
  - ZN-357.05
ordinal: 50780
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-08: a demo built on a component set that follows Nuxt UI (https://ui.nuxt.com, MIT): its design tokens (primary/neutral colour scales, radii, sizes xs..xl, variants solid/outline/soft/subtle/ghost/link) and its components: Button, Badge, Avatar, Card, Input, Textarea, Select, Checkbox, Switch, RadioGroup, Tabs, Accordion, Modal, Slideover, Dropdown menu, Tooltip, Toast, Table, Pagination, Breadcrumb, Navigation menu, Dashboard layout. Written as a zinc:ui kit module (lib/std/kit-nuxt or examples/nuxt-ui/kit) on the style system, not a copy of Vue code; the licence notice of Nuxt UI kept for the tokens. examples/nuxt-ui: a dashboard app (sidebar, header, stats cards, table, forms, modal) in light and dark. Research first: read the Nuxt UI docs and theme (app.config, ui tokens) and record what maps to zinc:ui and what is missing (a task each).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/nuxt-ui runs headless with goldens of its screens in light and dark
- [ ] #2 each listed component has a gallery entry with its variants and sizes
- [ ] #3 a page in docs/ maps Nuxt UI props and tokens to the zinc kit, with the gaps as tasks
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Split into ZN-357.01..05 (2026-10-08). Kit location decided in D38 (docs/reports/zinc-next-decisions.md): std module zinc:ui/nuxt in lib/std/nuxt/, both UI models; examples/nuxt-ui is its gallery and dashboard app.
<!-- SECTION:NOTES:END -->
