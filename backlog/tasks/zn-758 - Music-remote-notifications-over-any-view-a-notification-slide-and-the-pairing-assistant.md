---
id: ZN-758
title: >-
  Music remote: notifications over any view, a notification slide and the
  pairing assistant
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-17 08:46'
updated_date: '2026-10-17 11:25'
labels:
  - mobile
  - ui
  - size-M
milestone: m-26
dependencies:
  - ZN-756
ordinal: 196170
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-17: on the tablet (examples/music), a relayed notification wakes the screen if it is off and slides in over the current view (icon, app, title, body, time; larger in StandBy), several stack; a carousel slide lists the last notifications, well presented, with swipe to delete and clear all; when not paired, the same slide holds a step-by-step pairing assistant showing the code and the tablet's address (and what to do without discovery). Design and protocol: ../docs/reports/notification-relay-design.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 on the Nexus 7, a notification sent from the Mac relay appears over the player, the clock and the settings, and wakes the screen from off
- [x] #2 the notification slide lists, deletes and clears; the list survives a restart
- [x] #3 the pairing assistant pairs a new Mac step by step (screenshots of each step)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worktree agent, 2026-10-17).

What: examples/music/src/notify.ts (new) and its wiring in main.ts. zinc:link advertises "Musique" for service `notify` from the start; the carousel has a fifth slide, the notifications (or the pairing assistant before the first pairing).

Owner decisions of 2026-10-17 (relayed by the coordinator), in order:
- StandBy's animation: one zinc:gsap timeline a notification (phase 1 centred: round avatar with the app's badge for a message, else the app's icon, name and app below; phase 2 at 2.2 s: the image shrinks to the left, the time, who and the excerpt come in staggered; out at 9.4 s), a queue played 10 s apart, the overlay closes when it is empty; a touch opens it on the Mac.
- A light (white) iOS card and a "Style des notifications" setting were added, then dropped by the owner ("c'est moche en blanc"); the code, the setting and their goldens are removed.
- Final: StandBy's black overlay on the clock slide and when the notification wakes a sleeping screen (the owner: "parfait"); everywhere else with the screen on, the grey iOS cards of the first demo (stacked at the top, 6 s each) over a strong dim. No setting.

Protocol (docs/reports/notification-relay-design.md, section updated): consumed mac -> tablet `hello{host}`, `notif{id, kind: "message"|"other", sender, avatar, app{id,name,icon}, title, subtitle, body, date (unix s), domain, thread}`, `icon{hash, png (base64)}`, `clear`; sent tablet -> mac `ack{id}` (after storing), `need-icon{hash}` (once per hash and session, for app.icon and avatar), `open{id}` (a touch on the overlay, a card or a row). `mute` not sent yet.

Proofs:
- #1 Nexus 7 (release APK, armeabi-v7a), a stand-in relay on the Mac (tests/data/music/relay.ts, made-up notifications only): grey card over the player (docs/reports/music-notify/card-player.png) and over Réglages (card-settings.png), StandBy overlay over the clock (standby-1-clock.png, standby-2-clock.png), and the screen woken from off (screenrecord at 2 fps: black, StandBy phase 1, phase 2, the clock after, then off 12 s after: wake-0-off.png .. wake-3-after.png). need-icon/icon and ack seen in the relay's log.
- #2 tests/t1/music_notify.sh (13 s, PASS): StandBy goldens (phase 1, phase 2) waking a sleeping screen, the queue (the next 10 s later), touches opening n2, n3, n4 on the Mac, the list golden, a swipe deleting one (3 left in notifications.json), a restart reading the list back with its cached icons, a grey card golden over the dim and its touch opening n5, a touch on a row, "Tout effacer" emptying the file. On the tablet: list-after-restart.png (after an APK update and restart).
- #3 pairing on the tablet, step by step: pair-1-install.png, pair-2-code.png, pair-2-wrong-code-no-discovery.png (a wrong code counted, the address to type when discovery is blocked), pair-3-done.png, pair-4-list.png. The Mac found the tablet over DNS-SD with its pairing open, a wrong code was refused, the right one paired.

Frame times on the Nexus 7 (ZINC_PRESENT_STATS, per 120 frames): StandBy over the lava clock while it plays: interval p50 15.4 to 19.5 ms, p99 183 to 226 ms (raster p99 21 to 83 ms); idle clock p99 25 ms. Grey cards over the player: interval p50 16.5 to 18 ms, p99 56 to 63 ms (raster p99 49 to 52 ms). (The dropped white card: p50 19 ms, p99 38 to 60 ms.) A timeline holding still draws no frame (overlayStill in main.ts).

Changes outside notify.ts: ui.ts wrap() takes an alpha; main.ts: a notification row is a drag zone that still lets a swipe to the right move the carousel; tests/t1/music_city_standby.sh sets ZINC_MUSIC_RELAY=/dev/null so the test never binds port 7744 nor writes ~/.zinc/link/music.keys.

Left on the tablet: paired with "MacBook de test" (the stand-in; its key in /tmp/zn758/relay.keys on the Mac): the slide shows the list, "Ajouter un Mac" pairs Zinc Relay. The list was cleared with {t:"clear"}. The app on the clock slide; zinc.env (present stats) removed.

Not done here (later.md lines in the final report): mute from the tablet; forgetting a paired Mac; the TouchPad build with zinc:link; Map.get quirk.
<!-- SECTION:NOTES:END -->
