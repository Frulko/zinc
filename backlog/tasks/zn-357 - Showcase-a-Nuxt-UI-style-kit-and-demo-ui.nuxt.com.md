---
id: ZN-357
title: 'Showcase: a Nuxt UI-style kit and demo (ui.nuxt.com)'
status: Done
assignee: []
created_date: '2026-10-08 15:02'
updated_date: '2026-10-08 21:40'
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
- [x] #1 examples/nuxt-ui runs headless with goldens of its screens in light and dark
- [x] #2 each listed component has a gallery entry with its variants and sizes
- [x] #3 a page in docs/ maps Nuxt UI props and tokens to the zinc kit, with the gaps as tasks
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done through ZN-357.01..05: zinc:ui/nuxt (tokens, 10 controls, 5 overlays, navigation and data, dashboard layout), docs/nuxt-ui.md, examples/nuxt-ui dashboard app and gallery in light and dark (D38). Gaps: ZN-377 (RTL), ZN-378 (OKLab tints), ZN-379 (Public Sans), ZN-275 (enter / exit animations).
<!-- SECTION:NOTES:END -->
