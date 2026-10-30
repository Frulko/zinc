---
id: ZN-878
title: >-
  examples/discord: settings screen, allow only chosen servers (sidebar, unread,
  notifications)
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 17:31'
labels:
  - ui
  - size-S
milestone: m-28
dependencies:
  - ZN-868
ordinal: 99
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request 2026-10-30: a settings screen to choose the servers shown, so the others are not in the server rail and never notify. A gear at the bottom of the channel column opens it: one switch per server. Until the user saves a choice every server shows; once chosen it is an allowlist: a server joined later arrives off and marked new. A server that is off: hidden from the rail, not counted in unread or mention badges, no notification (ZN-870 reads the same setting), no channel, member or lazy-guild subscription. DMs always show. Kept locally (config file of the app through zinc:storage), never sent to Discord (no profile or guild-settings edit from a third-party client).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The settings screen lists every server with a switch; the choice is kept between runs
- [ ] #2 A server switched off leaves the rail and the unread and mention counts at once, and gets no subscription
- [ ] #3 After a choice is saved, a server joined later (GUILD_CREATE) is off and marked new in the settings
- [ ] #4 DMs always show; the T1 session switches a server off and checks the rail and the counts
<!-- AC:END -->
