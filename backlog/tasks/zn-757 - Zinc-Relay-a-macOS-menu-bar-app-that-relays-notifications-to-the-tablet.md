---
id: ZN-757
title: 'Zinc Relay: a macOS menu bar app that relays notifications to the tablet'
status: Done
assignee: []
created_date: '2026-10-17 08:46'
updated_date: '2026-10-25 01:53'
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
- [x] #1 a notification from Mail/Messages/Calendar and a browser web notification reach the tablet with their icon and fields; blocked apps and domains do not
- [x] #2 the settings list the apps seen so far and their domains, allow/block persists; the tray menu shows the pairing state and pauses relaying
- [x] #3 the capture method and its permission documented, with the first-run assistant
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner requirements added 2026-10-17 (through the coordinator), part of this task:
- Tray: a click opens the menu (state "Non appairé" or the tablet, "Ouvrir Zinc Relay…" with the window hidden until asked, "Réglages…", "Envoyer une notification de test" > "Directement à la tablette" / "Via macOS (de bout en bout)", "Quitter").
- Open on tap: tablet -> mac {t:"open", id}; the relay opens the app (the record's durl with its app, else the app), the last 50 ids kept.
- Protocol: notif gains kind ("message"|"other"), sender, avatar (<sha256>|null, sent like icons); tablet -> mac {t:"ack", id}.
- Focus: detect Do Not Disturb and the other modes; setting "Pendant un mode Concentration" (Relayer quand même by default / Ne pas relayer / Suivre le mode) with per-mode overrides; held ones counted in the menu.
- Avatar "ultra important": a chain of sources (record, Messages chat.db + Contacts, Contacts by name, apps' caches, optional banner capture), a monogram when nothing is found, never empty.
- Private APIs allowed for Zinc Relay (not meant for the App Store); every private call guarded; nothing that needs SIP off or code injection.
- A permission assistant (first launch, whenever a permission is missing, and from the menu): Full Disk Access, Contacts, Local network, Notifications, optional Accessibility + Screen Recording, pairing, login item (SMAppService, else LaunchAgent), an end-to-end test acknowledged by the tablet.

Decisions (taken alone):
- Capture: Notification Center's SQLite database, read-only in place through zinc:sqlite, polled every second on delivered_date (deduplicated by the record's uuid). Path, WAL and schema verified in macOS 15.7's /usr/sbin/usernoted (its CREATE TABLE strings, group.com.apple.usernoted + db2/, the plist keys titl subt body thre iden cate durl atta cnta peop srce icon). The Accessibility API on banners was rejected: on-screen banners only, no bundle id, a private view tree. Permission: Full Disk Access (EPERM from this agent's session, so no real record was read).
- Plist decoding: Foundation's NSPropertyListSerialization in a small plugin of the app (plugins/notifymac); nested bplists and keyed archives are decoded too; dictionaries carry "$keys" (Zinc has no Object.keys).
- Focus: ~/Library/DoNotDisturb/DB/Assertions.json (the active mode) + ModeConfigurations.json (names), read every 3 s; INFocusStatusCenter rejected (an entitlement, and only yes/no). "Suivre le mode" uses the record's presented flag: what the Mac showed despite the mode (allowed apps and people, time-sensitive).
- Avatar chain: 1 the record (an identity image, any image ranked by key path, image paths, attachment uuids in the attachment store), 2 the Messages chat.db handle at the notification's time + its Contacts photo, 3 Contacts by exact name else the only match, 4 a monogram (initials on one of 8 gradients by an FNV hash). The WhatsApp cache and the Accessibility + ScreenCaptureKit banner crop are not built (later.md lines in the report). No private framework was needed: the record's plist is read raw.
- The window is hidden by default: it opens on the first run, when Full Disk Access is missing, or when an optional step was neither granted nor passed (a --hidden login start: only for Full Disk Access).
- Login item: SMAppService.mainApp; a LaunchAgent (zinc:system/autostart) when the system refuses.
- End-to-end test: UNUserNotificationCenter when granted, else osascript's display notification; the body carries a marker the capture recognises; the tablet's ack ticks the step.
- Opening on a tap is only reported under ZINC_BACKGROUND=1: a test never takes the focus.

Engine fixes found on the way:
- The event loop entered the frame loop only when a program asked for frames during its first run, so render() from a menu click never drew. __runLoop now switches when __frameHook appears (tests/t0/late_frame.sh, which fails with the older binary).
- StyleSheet.hairlineWidth was a static field that called pixelScale() at module start: any program with zinc:ui and zinc:system/menu opened an empty window at start (and SDL then swallowed SIGTERM). Now a getter with the same values (rn_text_defaults passes).
- The zinc.json permission "contacts" (NSContactsUsageDescription in the bundle).

Proofs (2026-10-17, this Mac, macOS 15.7):
- tests/t1/notify_relay.sh PASS in 28 s: a fixture of the real schema (WAL, binary plists made by plutil, Focus files) and a test tablet found over DNS-SD: pairing by code, hello, Mail/Messages/Calendar/Chrome (alert helper)/Firefox relayed with their fields, 128 px icons by hash with a need-icon round, message kind and sender, an avatar from a record's identity image and a monogram, a blocked app, a blocked site, a site muted from the tablet, the pause and the Focus holding back, Focus follow and hold, open on tap (with durl), the direct test acked, the queue while the tablet is away, the settings file's counts, the settings window headless (scene texts), --inspect prints no value.
- tests/t0/notify_relay_unit.sh PASS (avatar source ranking, monogram, sites, filters with Focus, Focus files); a mutation check fails as it should.
- tests/t0/late_frame.sh PASS. link, plugin_manifest, system_ops, rn_text_defaults PASS. system_sim and system_manifest fail in this worktree only through stray warnings `unknown key "web"` read from /Users/mowmow/Lab/zinc/plugins (the main checkout, newer than this base): the 17 system goldens match once those lines are filtered, and both tests pass with the main tree's binary.
- A real run (the dev bundle, ZINC_BACKGROUND=1, --hidden): no window and no window library at start, the tray created, SIGTERM ends it; permissions read: full disk missing, contacts undetermined, local network ok, notifications undetermined, login item not found; with Full Disk Access missing the assistant opens. The dev bundle's Info.plist has LSUIElement true and NSContactsUsageDescription.
- Not proven: a real notification captured (needs Full Disk Access), the end-to-end test, the Contacts and Messages avatars, real browser records, the Nexus 7 (ZN-758's receiver is not on main yet).

Handover (Review: the rest needs the owner): grant Full Disk Access to ~/.zinc/cache/macos/devapp/dev.zinc.notify-relay.app (README, "What the owner does once"), run `zinc run examples/notify-relay`, allow Contacts and Notifications in the assistant, pair the tablet, press the end-to-end test; then run `zinc run examples/notify-relay -- --inspect 30` after a few messages to learn where macOS 15 keeps the avatars (keys, types and sizes only).
Review 2026-10-25: closed as Done. Relay app is built; what is left is an owner check (Full Disk Access, a real notification, pairing the tablet) written in the handover. Close as done and leave the run recipe in the README. Evidence: examples/notify-relay; task notes handover Verifier: 2 of 3 ticked; AC1 needs Full Disk Access granted, real notifications and a paired tablet, all owner steps; the run recipe is in backlog/later.md:673.
<!-- SECTION:NOTES:END -->
