# Desktop integration (`zinc:system`)

Notifications, menus, tray, dock, dialogs, window control, shortcuts, single instance, deep links, autostart, power and clipboard for apps on macOS and Linux desktops. One plugin (`plugins/system`), one native call carrying JSON ops, a permission gate, and a recording simulator that makes every call testable without a desktop. Design and the research behind it: [reports/system-integration.md](reports/system-integration.md). Plugin notes: [plugins/system.md](plugins/system.md).

## Use it

```jsonc
// zinc.json
{ "app": { "id": "dev.example.notes", "name": "Notes", "urlSchemes": ["notes"], "dock": true },
  "permissions": ["notification", "menu", "dock", "tray", "dialog", "window", "shortcut", "instance", "deep-link", "autostart", "opener", "power", "clipboard:rich"],
  "scopes": { "fs": "user-picked", "opener": { "allow": ["https://*", "mailto:"] } } }
```

```ts
import * as menu from 'zinc:system/menu';
import * as notification from 'zinc:system/notification';
menu.setApp([menu.role('appMenu'), menu.submenu('File', [menu.item('new', 'New', 'CmdOrCtrl+N')]), menu.role('editMenu')]);
menu.onClick('new', () => newDocument());
```

A runnable demo: `zinc run examples/system/desktop`.

| Module | What it does | Permission |
|---|---|---|
| `zinc:system` | backend, `supports(feature)`, events, `call` | none |
| `/notification` | show with actions and reply, cancel, delivered, permission | `notification` |
| `/menu` | application menu with roles and accelerators, popup, `toKit` for the kit's `MenuBar` | `menu` |
| `/tray` | status item: icon, title, tooltip, menu, click events | `tray` |
| `/dock` | badge, bounce, progress, dock menu | `dock` |
| `/dialog` | open, save, message, confirm; picked paths join the `user-picked` fs scope | `dialog` |
| `/window` | title bar styles, traffic lights, opacity, fullscreen, saved state, close-to-tray | `window` (`window:state`) |
| `/shortcut` | global shortcuts (Carbon hotkeys, no Accessibility permission) | `shortcut` |
| `/instance` | one running copy; a second launch hands argv and cwd to the first | `instance` |
| `/deeplink`, `/opener` | URL schemes, files opened with the app; open and reveal under `scopes.opener` | `deep-link`, `opener` |
| `/autostart` | LaunchAgent plist (macOS) or XDG autostart entry (Linux) | `autostart` |
| `/power`, `/clipboard` | battery, idle, sleep/wake/lock, appearance, sleep blocker; html, image, files on the clipboard | `power`, `clipboard:rich` |

Permissions are deny by default and checked twice: importing a module without its permission is error **Z5006** at compile time, and the native side refuses an op whose id was not compiled in.

## macOS app identity

`zinc run` of an app with `app.id` and permissions runs from a cached dev bundle (`~/.zinc/cache/macos/devapp/<id>.app`, ad-hoc signed, refreshed in 0.1 ms when unchanged) so notifications, the menu bar title, the dock and URL schemes behave as in the shipped app. `zinc build --bundle main.ts -o App.app` writes the real bundle (Info.plist from `app`, `icon.icns` from the PNG, `LSUIElement` for `dock: false`); signing with an identity and notarisation are commands for the owner:

```sh
codesign --force --options runtime --sign "Developer ID Application: ..." App.app
```

## Testing

| What | Command |
|---|---|
| The simulator goldens (menus, notifications, dock, tray, dialogs, window, shortcuts, opener, interpreter = AOT) | `tests/run --tier t1 --only system_sim` |
| Op table, typings and gate drift | `tests/run --only system_ops` |
| Accelerator parser, role table, window state (unit cases) | `zinc test plugins/system/tests` |
| The permission gate through the native ABI | `tests/run --tier t1 --only native_plugins` |
| Single instance (two processes) and autostart in a temporary HOME | `tests/run --tier t1 --only system_instance` |
| The real macOS features: menu, dock, tray, window, shortcut, dialog, power, deep link, bundle | `tests/run --tier t2 --only desktop` (needs a GUI session) |
| The kit's drawn menus | `tests/run --tier t1 --only kit_menubar` |

In the simulator (`ZINC_DETERMINISTIC=1`, `ZINC_HEADLESS=1` or `ZINC_SYSTEM=sim`) every call prints `[system] <op> <json>`; `ZINC_SYSTEM_SCRIPT=file` delivers events (`<tick> <event> args...`), `ZINC_SYSTEM_NOTIFICATION_PERMISSION` sets the simulated user's choice.

## What each platform gets

| Feature | macOS | Linux | Pi, reMarkable, ESP32, PS1/PS2, wasm |
|---|---|---|---|
| Notifications | UNUserNotificationCenter in a bundle, `osascript` otherwise | D-Bus (parked, ZN-245) | unsupported |
| Application menu | native `NSApp.mainMenu` | the kit's `MenuBar` (`menu.native` false) | the kit's `MenuBar` |
| Context menu, dock menu | NSMenu popup, dock menu | the kit's `ContextMenu` | the kit's `ContextMenu` |
| Tray | NSStatusItem | StatusNotifier (parked) | unsupported |
| Dock badge, progress, bounce | yes | launcher entry (parked) | unsupported |
| Dialogs | NSOpenPanel, NSSavePanel, NSAlert | portal or zenity (not written) | the kit's `Dialog` |
| Window control | NSWindow through SDL's window | SDL window | SDL window where there is one |
| Global shortcuts | Carbon hotkeys | X11 grab (not written) | unsupported |
| Single instance, autostart, deep links | flock + socket, LaunchAgent, Apple Events | flock + socket, XDG autostart, `.desktop` + argv | unsupported |
| Power, idle, clipboard | IOKit, CoreGraphics, NSPasteboard | not written | unsupported |

"Unsupported" means the module's `isSupported()` is false and calls fail with `SystemError('unsupported')`; a build does not fail unless zinc.json says `"requires": ["tray"]`.
