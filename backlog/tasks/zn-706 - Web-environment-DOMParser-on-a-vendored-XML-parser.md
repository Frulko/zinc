---
id: ZN-706
title: 'Web environment: DOMParser on a vendored XML parser'
status: Backlog
assignee: []
created_date: '2026-10-10 22:50'
labels:
  - js
  - qjs
  - size-S
milestone: m-22
dependencies: []
ordinal: 14500
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Left by the web environment, ZN-568, see its decision record and docs/reports/zinc-next-webenv.md.) Libraries parse SVG and XML (bitmap fonts, tile maps) with DOMParser. Vendor a mature parser (@xmldom/xmldom, MIT) rather than write one, loaded at the first use.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a bitmap font XML and an SVG parse to the nodes a browser gives (golden)
- [ ] #2 nothing is loaded when DOMParser is not used
<!-- AC:END -->
