---
id: ZN-923
title: >-
  discord: themes that change the layout, a real Slack skin and a real Teams
  skin
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-31 09:34'
labels:
  - discord
  - ui
dependencies: []
ordinal: 617460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-31 (screenshot of the Slack theme): it is Discord's layout in Slack's colours and does not look like Slack. A theme must be able to choose a layout, not only colours. Slack: workspace header with name and caret, collapsible sections (Channels, Direct messages, Apps/Huddles), no member list (the right column is an empty purple band today), square rounded avatars on every message group, name and time on one line, hover toolbar, top bar with channel name, star, member avatars and topic, composer with the formatting toolbar (B, I, U, link, lists, code) above the field and a green Send, Lato-like type. Teams: left activity rail, purple selected-channel bar, tabs row, compose box.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A theme JSON can name a layout preset (discord, slack, teams) that changes the sidebar structure, message row, header and composer, with the colour tokens kept
- [ ] #2 Slack preset reproduces Slack's screen (frame compared with Slack's look: sidebar sections, header, message rows with square avatars, composer toolbar, no member list)
- [ ] #3 Teams preset reproduces the activity rail, selected bar, tabs and compose box
- [ ] #4 Switching theme in Settings switches the layout live; every layout keeps tooltips, i18n, code tab, viewer and call bar working
<!-- AC:END -->
