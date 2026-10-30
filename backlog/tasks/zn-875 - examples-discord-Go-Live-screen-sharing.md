---
id: ZN-875
title: 'examples/discord: Go Live screen sharing'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 14:57'
labels:
  - net
  - media
  - size-M
milestone: m-28
dependencies:
  - ZN-873
  - ZN-874
ordinal: 194
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 5: gateway ops 18/19/20/22, STREAM_CREATE and STREAM_SERVER_UPDATE, the second voice connection with rtc_server_id, the stream key's DAVE group, bitrate adaptation and keyframe requests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Sharing a screen or a window from the app is watched in the official client
- [ ] #2 Stopping the share ends the stream cleanly
- [ ] #3 Bitrate drops when the link is limited (measured with stats)
<!-- AC:END -->
