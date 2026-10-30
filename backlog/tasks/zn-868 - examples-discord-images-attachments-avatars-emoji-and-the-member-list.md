---
id: ZN-868
title: 'examples/discord: images, attachments, avatars, emoji and the member list'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 14:53'
labels:
  - net
  - ui
  - size-M
milestone: m-28
dependencies:
  - ZN-867
ordinal: 124
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CDN avatars, emoji and image attachments with a disk cache that respects expiring attachment URLs; file upload (cloud upload flow); the member list of the open channel (op 37 lazy guild subscription, body taken from a capture of the web client as the report asks). Virtualised message list.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Avatars, custom emoji and image attachments render and are cached on disk
- [ ] #2 A file picked or dropped is uploaded and shows in the channel
- [ ] #3 The member list of the open channel loads and updates
- [ ] #4 Scrolling a 2,000-message history stays smooth; idle frames check of GUIDELINES passes
<!-- AC:END -->
