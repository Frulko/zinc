# zinc:system audit (score 3/5)

## What it is
Desktop and phone integration for apps: notifications, menus, tray, dock, dialogs, window control, global shortcuts, single instance, deep links, autostart, clipboard, power, opener, share, self-update. One JSON-op door, a permission gate and a recording simulator.

## Targets and status
- plugin.json: macos (real), ios and android (notifications, share, opener, pickers, deep links), linux and windows (simulator / unsupported). Linux features are "parked" in the doc table.
- Tests: `system_sim`, `system_ops`, `system_phone`, `system_instance`, `system_signals`, `system_manifest` (t0/t1) and t2 `desktop` (real macOS). Unit tests in `plugins/system/tests`.
- Largest doc set of the ten: `docs/desktop-integration.md` (platform matrix, permissions, testing) and `docs/plugins/system.md` (15 long lines).

## What the docs have
- [x] overview, [x] zinc.json permissions, [x] module table, [x] platform matrix, [x] testing table, [x] simulator and event script format
- [x] runnable `examples/system/desktop` (README is 3 lines), more users: notify-relay, agents, museum-table editor, pinball3d-editor
- [ ] API reference per module (menu, tray, notification... only one line each), [ ] screenshots, [ ] tutorials, [ ] ops table

## What is missing
1. Per-module API pages generated from `plugins/system/*.ts` and `ops.json` (78 ops: name, permission, args, result, simulator answer).
2. Screenshots (macOS): menu bar, dock badge and progress, tray menu, notification, open dialog from `zinc run examples/system/desktop` (`ZINC_SHOT` captures the window only; menu bar and tray need `screencapture`). (owner)
3. Tutorial "Make your app a menu-bar utility": tray + close-to-tray (`preventClose`) + autostart + global shortcut, 6 steps.
4. Tutorial "Notifications with actions and reply" and "Open `notes://` links (deep links + single instance)".
5. Notes to know: Developer ID signing command exists but the notarisation flow, Gatekeeper and the Accessibility-free Carbon shortcuts could use a short checklist; terminal-vs-bundle identity for notifications.
6. `examples/system/desktop/README.md` should list what to click and show 3 screenshots.
7. Linux status in one table with the parked task ids (ZN-245).

## Wrong or stale
- `docs/plugins/system.md`: "The macOS and Linux backends and the feature modules arrive task by task (ZN-235..); until then those modules are stubs whose `isSupported()` is false" is stale: `native/system.macos.mm` and all feature modules exist and have t2 tests.
- `system.md` and `desktop-integration.md` say "macOS and Linux"; the manifest also carries ios, android, windows.
- The module table in desktop-integration.md omits `zinc:system/share` and `zinc:system/update` (files exist); `zinc:system/permissions` and `app` are generated.
- `info` architecture quirk (backlog/later.md ZN-729.08) is not a doc error, but note it for `zinc device`.

## Suggested pages
Overview; Permissions and zinc.json; API reference (generated per module: notification, menu, tray, dock, dialog, window, shortcut, instance, deeplink, opener, autostart, power, clipboard, share, update); Ops table; Recording simulator and event scripts; Platform matrix; Tutorials (menu-bar utility, notifications, deep links); Phones; Example: desktop demo; Testing.
