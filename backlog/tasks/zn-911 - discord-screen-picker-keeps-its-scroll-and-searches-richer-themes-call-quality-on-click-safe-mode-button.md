---
id: ZN-911
title: >-
  discord: screen picker keeps its scroll and searches, richer themes, call
  quality on click, safe mode button
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-31 07:51'
updated_date: '2026-10-31 08:10'
labels:
  - discord
  - ui
dependencies: []
ordinal: 605460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-31: scrolling the list of screens and windows jumps back to the top; it needs a search bar; improve the themes; clicking the connection quality shows its details; a button for safe mode.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Scrolling the screen-capture picker keeps its position while thumbnails refresh (engine fix with a test if zinc:ui loses it)
- [x] #2 The picker has a search field filtering screens and windows by name
- [x] #3 Themes improved: more tokens applied across the app, each theme reviewed on a frame
- [x] #4 Clicking the call's connection indicator opens its quality details (RTT, loss, jitter, bitrate, codec, MOS)
- [x] #5 A visible safe mode toggle in the app (not only in Account safety) wired to the safety model
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-31. Scroll: not an engine gap. The picker rebuilt its whole body on each 1.5 s thumbnail refresh, so its ScrollView was a new node at offset 0; the list (and the new search field) are now kept, only their children are rebuilt. tests/t1/screen_picker.sh (ZINC_FAKE_WINDOWS=8, new in the fake backend) fails on the old picker (same list false, same place false) and passes now. Search: an Input in the dialog header filters by name or app; Share takes the first shown. Themes: 5 new tokens (accentText, success, warning, stage, stageTile) replace the hard-coded colours of the call view, call bar, presence dots, voice ring; the theme now also defines zinc:ui/kit's scheme variables (Switch, Slider, Tabs, CallStats, the picker take the theme). Frames looked at: Discord dark, Slack, Teams (call view, picker, stats), Discord light with safe mode on. Quality: the signal bars are in the channel list's call bar too and open the CallStats panel (MOS, loss, RTT, jitter, kbit/s, codec line with video codec and available bitrate, ultra low data) outside the call view; voice session prints it. Safe mode: guard.chooseSafeMode/safeModeOn/safeModeEnd in safety/index.ts (kept in zinc:storage 'safe-mode'), shield in the user bar, a Switch on Account safety; discord_safety checks typing refused with 'Not sent: safe mode.'. Tests: screen_picker, screen_capture, discord, discord_safety, discord_voice (goldens re-recorded: frame hashes, the new session lines, one 'voice wants' when the call view is left), webrtc_call.
<!-- SECTION:NOTES:END -->
