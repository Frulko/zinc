---
id: ZN-916
title: 'discord: a real Slack theme (and check Teams)'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-31 08:40'
updated_date: '2026-10-31 09:03'
labels:
  - discord
  - ui
dependencies: []
ordinal: 610460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-31: why is there no real Slack theme? Make it faithful: aubergine sidebar, white main pane, Slack's channel list, message density and colours, as a JSON theme.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Slack theme looks like Slack (sidebar, headers, composer, hover states) on frames
- [x] #2 Teams theme reviewed the same way
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Slack theme (slack.json, light + aubergine) needed per-surface tokens: sidebar* and surface, composerBorder (theme.ts, constants.ts SB_*/BG_SURFACE, schema, README). Old dark theme is slack-dark. Teams reviewed on a frame: outlined white composer added. DISCORD_THEME=<id> chooses a theme for frames.
<!-- SECTION:NOTES:END -->
