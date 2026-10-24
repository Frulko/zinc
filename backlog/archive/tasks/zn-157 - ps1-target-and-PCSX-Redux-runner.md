---
id: ZN-157
title: ps1 target and PCSX-Redux runner
status: Backlog
assignee: []
created_date: '2026-10-06 23:05'
labels:
  - targets
  - size-L
milestone: m-11
dependencies:
  - ZN-156
  - ZN-124
ordinal: 294000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
HAL ps1 reuse, VRAM bands, deterministic frame step, runner PcsxRedux (OpenBIOS).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the 9 programs of the old ps1 row pass byte-identical; breakout screenshot hash equals the stored one
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: merged into ZN-156. Same parked PS1 line as ZN-156: fold the runner criteria (9 programs byte-identical, breakout hash) into ZN-156 and delete this task. Verifier: ZN-156 (Backlog) is the same parked PS1 line and open. Carry ZN-157's AC (the 9 old ps1 programs byte-identical, breakout screenshot hash) and its description (HAL ps1 reuse, VRAM bands, deterministic frame step, PcsxRedux/OpenBIOS runner) into ZN-156.
<!-- SECTION:NOTES:END -->
