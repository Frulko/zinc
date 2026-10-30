---
id: ZN-868
title: 'examples/discord: images, attachments, avatars, emoji and the member list'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 14:53'
updated_date: '2026-10-30 18:04'
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
- [x] #1 Avatars, custom emoji and image attachments render and are cached on disk
- [x] #2 A file picked or dropped is uploaded and shows in the channel
- [x] #3 The member list of the open channel loads and updates
- [x] #4 Scrolling a 2,000-message history stays smooth; idle frames check of GUIDELINES passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done in an agent worktree on 2026-10-30.

- **AC1 (pictures):** tests/t1/discord.sh runs against the fake CDN. session.out shows:
  - 'picture avatars/101/av101.png: from the CDN'
  - 'picture emojis/78.png: from the disk', from the seeded cache
  - 'refreshed attachments/302/903/801/photo.png': the URL had expired, so POST /attachments/refresh-urls renewed it before the GET
  - 'cached ...' files for avatars, icons, emoji and attachments

  A screenshot was checked by eye: avatars, the server icon, the photo, the member list, and colour emoji in the DM.
- **AC2 (upload):** the same session logs 'uploaded notes.png'. server.out shows:
  - POST /channels/302/attachments with file=notes.png
  - 'upload PUT /upload/u0/notes.png bytes=276 token=false'
  - the message POST with attachments=0:notes.png:u0/notes.png

  The app then logs 'sent a file: Here is the photo, notes.png 160x120' and loads its picture from the CDN.
  A dropped file goes through `on('drop')` of zinc:system to the same sendFiles. The drop itself is not scripted, since it needs a real drag.
- **AC3 (member list):**
  - Opening a server channel sends op 37.
  - The SYNC gives 'members 200: [online 2] Grace(online) Ada(online) [offline 1] linus(offline)'.
  - After the INSERT and the UPDATE: '[online 3] Grace(idle) Ada(online) Katherine(online) [offline 1] linus(offline)'.

  The body follows docs/reports/discord-client-research.md. It has not been checked against a capture of the web client. It is isolated in subscription() of src/members.ts.
- **AC4 (scrolling and idle):**
  - Scroll bench: DISCORD_BENCH=1 with FAKE_HISTORY=1997, windowed in the background on the M1 Pro. 2,001 messages, scrolled to the top and back in 3,919 steps of 60 px. Work p50 3.07 ms, p99 7.44 ms; layout p50 2.53 ms, p99 6.51 ms; paint p50 0.30 ms, p99 0.75 ms.
  - Idle check: ZINC_FRAMES=300 ZINC_PROFILE=1 on the login screen gives paint p99 0.00, and every stage is 0.00.
- `tests/run --only discord` passed 6 times in a row.
- Engine fixes, each in its own commit with a T0 test on the interpreter, QuickJS and native:
  - emoji_text: emoji are drawn with ZINC_TEXT=shaped in compiled and QuickJS runs. Without the shaped tier, a one-time hint replaces the silent '?'.
  - virtual_stick: VirtualList honours its scroll flags (stickToBottom) and keeps the measured row heights.
  - virtual_rows: rows are unmounted when they scroll out.
  - splice_any: Array.splice accepts a start or count of type any.
  - virtual_rows: an unmounted component's views are destroyed, together with its list's rows and its onScroll handler.

  The last fix explains a flaky T1 frame, about one run in six. A channel's old history list stayed alive, and its handler fired for a later list, which loaded older pages by itself.
- Decision for the record: the app opts into "text": "shaped" (tier D32) for colour emoji.
<!-- SECTION:NOTES:END -->
