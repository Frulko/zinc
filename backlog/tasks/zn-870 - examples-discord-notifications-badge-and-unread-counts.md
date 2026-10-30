---
id: ZN-870
title: 'examples/discord: notifications, badge and unread counts'
status: Backlog
assignee: []
created_date: '2026-10-30 14:53'
labels:
  - ui
  - desktop
  - size-M
milestone: m-28
dependencies:
  - ZN-867
ordinal: 144
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 2: the mention, mute and suppress rules of section 6 of the research report (user_guild_settings, read states, @everyone/roles, DMs), native notifications through zinc:system, Dock badge and tray count, a click opens the channel, no notification for the focused channel.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A DM and a mention notify; a muted channel or server does not; the focused channel does not
- [ ] #5 A server switched off in the app's settings (ZN-878) never notifies
- [ ] #2 Clicking a notification opens its channel
- [ ] #3 The Dock badge shows the mention count and clears on read
- [ ] #4 The rules have a demo test over recorded events
<!-- AC:END -->
