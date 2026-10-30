---
id: ZN-870
title: 'examples/discord: notifications, badge and unread counts'
status: Done
assignee: []
created_date: '2026-10-30 14:53'
updated_date: '2026-10-30 19:06'
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
- [x] #1 A DM and a mention notify; a muted channel or server does not; the focused channel does not
- [x] #2 A server switched off in the app's settings (ZN-878) never notifies
- [x] #3 Clicking a notification opens its channel
- [x] #4 The Dock badge shows the mention count and clears on read
- [x] #5 The rules have a demo test over recorded events
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done. src/notify.ts: the rules of the research report section 6, pure, over Discord's JSON (READY user_guild_settings entries or list, merged_members for my roles, default_message_notifications; USER_GUILD_SETTINGS_UPDATE; GUILD_CREATE's default). Levels: channel override, then its category's (official client behaviour), then the server's, then its default; mutes with mute_config.end_time; suppress_everyone/suppress_roles; DMs notify unless muted, a mention beats the mute; SUPPRESS_NOTIFICATIONS, own messages and RECIPIENT_REMOVE never; ALL skips voice/stage chats. Threads are not followed (ponytail note). state.ts: never for a server switched off here (ZN-878) nor the channel shown in a focused window (new engine signal: zinc:ui windowFocused(), HAL focus 0/1); mention counts use the same rules (roles). services/notifications.ts: zinc:system notification per channel (id channel-<id> replaces), click opens the channel and focuses the window, Dock badge = mentions of DMs and shown servers. Tests: tests/demo/discord_notify.sh (20 recorded cases, interp and AOT), tests/t1/discord.sh step notifications() (focused channel silent, DM behind another window notifies, click opens it, badge 1 then cleared; the system simulator's calls are in the session). The click is proven by calling the Notification's click callbacks, not by a notification-click event from the simulator. Engine gap fixed on the way: bitwise operators on any (Z0005), commit fix(check).
<!-- SECTION:NOTES:END -->
