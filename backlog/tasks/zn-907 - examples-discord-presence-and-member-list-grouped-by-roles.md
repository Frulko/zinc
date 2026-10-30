---
id: ZN-907
title: 'examples/discord: presence and member list grouped by roles'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 23:06'
updated_date: '2026-10-30 23:24'
labels:
  - ui
  - net
  - size-M
milestone: m-28
dependencies: []
ordinal: 601460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: presence indicators (online, idle, do not disturb, offline, mobile) on avatars and DMs, and the server member list as Discord shows it: online members grouped by hoisted roles with role colours and counts, offline last, through the lazy member list (op 37) for what is on screen only, kept current from presence and member list updates. Read only: role and server settings stay in the official app.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done in examples/discord (ZN-907).
- Presence: Presence map in state.ts fed by READY merged_presences.friends (or presences), PRESENCE_UPDATE and the member list's rows; online/idle/dnd dots and a green phone for mobile-only (client_status) via Avatar.tsx Status; DMs show the recipient's avatar with presence (offline grey), the member list dims offline members.
- Member list: rows as Discord groups them (hoisted roles, Online, Offline with counts, from GUILD_MEMBER_LIST_UPDATE); the list holds every row of the groups' counts, unsynced rows are blank bars; names in the colour of the member's highest coloured role (roles' color/position from the guild). Virtual list; op 37 asks for [0,99] plus the hundreds on screen (3 ranges at most), re-sent only when the ranges change (Store.memberRows, the one call site of gateway.subscribe).
- Proof: tests/t1/discord.sh run 1: fake SYNCs each range of a 156-row list (maintainers, Online, Offline 151), INSERT Katherine on mobile, UPDATE Grace idle, PRESENCE_UPDATE linus dnd; scrolled to its end, op 37 asks [[0,99],[100,199]] and all 157 rows are synced; DM presences from READY. Frame looked at (members list and the DM list with dots) before re-recording.
later.md: - ZN-907: show my own status (READY sessions) on my avatar in the user bar, and the status picker stays in the official app.
later.md: - ZN-907: member rows of a guild channel whose permissions differ (Discord's list id) share one list; read the list id when a capture shows it.
<!-- SECTION:NOTES:END -->
