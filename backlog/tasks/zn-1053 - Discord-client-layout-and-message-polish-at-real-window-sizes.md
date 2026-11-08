---
id: ZN-1053
title: 'Discord client: layout and message polish at real window sizes'
status: Backlog
assignee: []
created_date: '2026-11-07 16:40'
labels:
  - discord
  - ui
  - size-M
milestone: m-28
dependencies: []
ordinal: 17600
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Visible gaps of examples/discord on a Mac window: narrow widths, lists, avatars, pins, thread composer, share dialog.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-867: the Discord client acks without checking whether its window has the focus; ack only when the channel is visible in a focused window, as the web client does.
- ZN-867: Discord lists (`- item`) stay plain text in the client; draw bullets.
- ZN-868: the Discord client's CDN picture map never evicts; cap it (LRU) for long sessions.
- ZN-868: the default avatar index needs the 64-bit shift (`(id >> 22) % 6`); check it against big ids.
- ZN-868: the member list ignores the list id of GUILD_MEMBER_LIST_UPDATE; verify op 37 against the real gateway.
- ZN-903: load newer pages when a history left after a jump far back is scrolled to its end, instead of only Jump to present.
- ZN-903: a composer in the thread pane (today the arrow opens the thread as the channel, to write).
- ZN-903: my roles changed during the session (GUILD_MEMBER_UPDATE for me) do not update the pin permission until the next start.
- ZN-911: the share dialog could update its thumbnails in place when the sources are the same, instead of rebuilding the list every 1.5 s (cheaper on modest machines).
- ZN-911: the safe mode shield of the user bar is icon-only; a tooltip or a small label would help first-time users.
- ZN-913: the share dialog's Settings button is a text label and the screen card icon a drawn rectangle: use real gear and monitor icons; Discord's HD banner also has Get Nitro and heart buttons.
- ZN-915: the real minimum window size (`zinc.json` `minWidth`) and widths below 640 px are unverified; CallView and Settings were not reviewed at narrow widths.
- ZN-?: Discord at 320 px: the composer should fold some buttons into a menu (the placeholder reads "Message #"), the Go Live dialog needs a smaller list on short windows (footer pushed off a 700 px window), the image viewer hides its caption.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 At 320 px the composer folds buttons into a menu and the Go Live dialog fits a 700 px window; minWidth verified
- [ ] #2 Markdown lists draw bullets; the member list reads its list id; the picture map is capped (LRU); acks only when the channel is visible and focused
- [ ] #3 Thread pane has a composer; newer pages load when a jump-back history is scrolled to its end; pin permission follows GUILD_MEMBER_UPDATE
- [ ] #4 Share dialog uses real gear and monitor icons and updates thumbnails in place; the shield has a tooltip
<!-- AC:END -->
