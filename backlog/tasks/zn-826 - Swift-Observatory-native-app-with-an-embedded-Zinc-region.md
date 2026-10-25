---
id: ZN-826
title: Swift Observatory native app with an embedded Zinc region
status: Ready
assignee:
  - '@parallel'
created_date: '2026-10-25 11:00'
labels:
  - size-L
  - embed
  - swift
dependencies:
  - ZN-825
ordinal: 535460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-25): launch the Swift/Godot/Blender workflows and demos with agents. Build Native Observatory: macOS SwiftUI chrome surrounds one real Zinc child view, with bidirectional selection speed and pause controls. Reuse the embedding task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The macOS app builds and embeds Zinc in the same window with no external Zinc window
- [ ] #2 Swift controls update Zinc and Zinc selection updates a native details panel
- [ ] #3 Retina resize keyboard focus hide show and shutdown have a scripted proof
- [ ] #4 A runnable README targeted smoke check and reviewed capture accompany the demo
<!-- AC:END -->

## Delivery contract

Owner clarification (2026-10-25): deliver a real runnable project, source files, a README with exact build/run/test commands, required native or authoring project files, and actual execution evidence. A specification or mock alone does not satisfy this task. Do not mark unsupported or unexecuted behavior as Done.
