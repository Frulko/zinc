---
id: ZN-988
title: 'Hamlet UI: message log and event notifications with jump to location'
status: Done
assignee: []
created_date: '2026-11-01 14:25'
updated_date: '2026-11-01 15:00'
labels:
  - hamlet
  - demo
  - ui
  - m3
  - size-M
milestone: m-30
dependencies: []
ordinal: 747080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A scrolling message list: arrivals, shortages, fires, goals reached; each entry can jump the camera to the place; the message button blinks when something new arrives; urgent ones also show as a small banner.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Events from the simulation append typed messages with a tile
- [x] #2 Clicking a message centres the camera on its tile
- [x] #3 Banner for urgent events and a blinking button for new ones
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Events: new hints of severity 2 or more (rules/hints.ts) and population milestones. Code landed with the control column commit.
<!-- SECTION:NOTES:END -->
