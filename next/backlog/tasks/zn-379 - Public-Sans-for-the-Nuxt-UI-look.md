---
id: ZN-379
title: Public Sans for the Nuxt UI look
status: Done
assignee: []
created_date: '2026-10-08 18:48'
updated_date: '2026-10-08 22:08'
labels:
  - ui
  - fonts
  - size-S
milestone: m-17
dependencies: []
ordinal: 139000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gap found by ZN-357.01: ui.nuxt.com uses Public Sans (SIL OFL 1.1) at 400-700; zinc:ui/nuxt defaults to the system sans. Vendor Public Sans (pinned version, licence, third_party/README.md row) as an optional font asset the kit uses when the project names it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 examples/nuxt-ui renders in Public Sans with its weights 400, 500, 600, 700 (golden)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: Public Sans v2.001 (OFL 1.1, no reserved name) Regular/Medium/SemiBold/Bold subset to Latin in examples/nuxt-ui/assets (~30 KB each); zinc:ui setFontSans(family) = Tailwind's --font-sans (font-sans resolves to the app's family first, Inter fallback); examples/nuxt-ui calls setFontSans('PublicSans'). Test: tests/t1/nuxt_ui.sh adds inspect-font.tsx (the four weights resolve to their files, mono unchanged); the 15 frame hashes and the README screenshots re-recorded. tests/run --changed 44/44, proto-capture compare 4/4. usage: n/a
<!-- SECTION:NOTES:END -->
