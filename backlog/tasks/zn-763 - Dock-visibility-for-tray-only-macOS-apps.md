---
id: ZN-763
title: Dock visibility for tray-only macOS apps
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-19 23:00'
labels:
  - system
  - desktop
  - size-S
milestone: m-16
dependencies: []
ordinal: 1001
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-19: a tray-only macOS app (zinc.json "dock": false, LSUIElement, activation policy Accessory), such as the Atelier twin tray app, must show itself in the Dock and Cmd+Tab while its settings window is open and hide again when it closes: the standard pattern, policy Regular plus activateIgnoringOtherApps when a window opens, Accessory when the last one closes. Add it to zinc:system/dock.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc:system/dock setVisible(visible) and isVisible() (ops dock.setVisible, dock.isVisible in ops.json, generated ops.d.ts and ops.gen.h)
- [x] #2 macOS: setVisible sets the activation policy Regular or Accessory; showing activates the app, except under ZINC_BACKGROUND; isVisible reads the policy back
- [x] #3 the simulator keeps the state; the web backend accepts both; other backends answer from the table (no-op)
- [x] #4 goldens: tests/golden/system/dock (simulator) and tests/golden/macos/dock (the live policy read back)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
plugins/system/native/system.macos.mm dockCall: dock.setVisible -> [NSApp setActivationPolicy:Regular|Accessory], then [NSApp activateIgnoringOtherApps:YES] when showing and ZINC_BACKGROUND is unset or 0 (an Accessory app is never active, so its window would open behind the frontmost app); dock.isVisible -> activationPolicy == Regular. Under ZINC_BACKGROUND the policy still changes (a Dock icon appears while visible), only the activation is skipped. Simulator (system.host.cpp): one bool, initially true. Web: setVisible in the presentation no-op list, isVisible answers true. PASS system_ops, system_sim, macos_dock. Ad-hoc check with a bundle whose Info.plist has LSUIElement true ("dock": false): isVisible false at start, true after setVisible(true), false after setVisible(false). Not checked by eye: the Dock icon and the Cmd+Tab entry appearing, and the window coming to the front (tests run in the background, which skips the activation).
<!-- SECTION:NOTES:END -->
