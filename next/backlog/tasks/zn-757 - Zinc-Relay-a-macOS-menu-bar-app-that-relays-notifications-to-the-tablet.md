---
id: ZN-757
title: 'Zinc Relay: a macOS menu bar app that relays notifications to the tablet'
status: Backlog
assignee: []
created_date: '2026-10-17 08:46'
labels:
  - desktop
  - net
  - size-L
milestone: m-26
dependencies:
  - ZN-756
ordinal: 196160
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-17: examples/notify-relay, a small macOS app in the menu bar (zinc:system tray), in the background, that catches the Mac's notifications as they arrive (all fields and the app's icon), filters them by app and by browser domain (settings list every app seen so far, allow/block, add an app blocked in advance; domains of web notifications blockable), and sends them to the paired tablet over zinc:link; first-run assistant for the macOS permission the capture needs. Verify first how notifications can be read on macOS 15 (Notification Center's database with Full Disk Access, or the Accessibility API). Design and protocol: ../docs/reports/notification-relay-design.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a notification from Mail/Messages/Calendar and a browser web notification reach the tablet with their icon and fields; blocked apps and domains do not
- [ ] #2 the settings list the apps seen so far and their domains, allow/block persists; the tray menu shows the pairing state and pauses relaying
- [ ] #3 the capture method and its permission documented, with the first-run assistant
<!-- AC:END -->
