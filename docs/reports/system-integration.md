# Desktop system integration for Zinc apps

Status: analysis and proposal, 2026-10-07. Scope: macOS and Linux desktops get the real thing; Pi, ESP32, reMarkable, PS1/PS2, wasm get a stub that
reports "unsupported" (Windows stays out of scope, RULES.md section 2). Nothing here changes a demo: apps that do not import `zinc:system/*` are untouched.

Sources read: Tauri v2 docs (notification, capabilities), Electron docs (Notification), the muda / tray-icon / global-hotkey / window-state design as known from
tauri-apps repositories, Qt `QSystemTrayIcon`, Flutter `tray_manager` / `window_manager` / `flutter_local_notifications`, the vendored SDL3 3.4.16 sources
(`next/third_party/SDL3/src/{tray,dialog,video/cocoa}`), the freedesktop Notifications and StatusNotifierItem specifications, and the Zinc code listed in section 2.
Items marked (verify) come from memory of those projects and are covered by a spike in section 9.

## 1. What the others do (good practices to keep)

| Topic | Tauri v2 | Electron | Qt / Flutter | Take for Zinc |
|---|---|---|---|---|
| Notification | `plugin-notification`: `isPermissionGranted`, `requestPermission`, `sendNotification`, channels, `registerActionTypes` + `onAction`. Windows dev mode shows the PowerShell identity; desktop uses notify-rust (verify) | `Notification` class with `show/click/close/reply/action/failed` events, `Notification.isSupported()`. macOS: UNNotification API, **needs a code-signed app**, unsigned emits `failed` | `QSystemTrayIcon::showMessage` (no actions); `flutter_local_notifications`: init with per-platform settings, `requestPermissions`, payload on tap | Permission query + request, an object with events, `isSupported`, `failed` as an explicit result instead of a silent drop, actions and reply on macOS |
| App menu | `muda`: `Menu`, `Submenu`, `MenuItem`, `CheckMenuItem`, `IconMenuItem`, `PredefinedMenuItem` (copy, paste, quit, about...), accelerators `CmdOrCtrl+S`, events by id | `Menu.buildFromTemplate`, `role`, `accelerator`, `click`, `Menu.setApplicationMenu`; default menu if none | Qt `QMenuBar` merges "About/Quit/Preferences" into the macOS app menu by `MenuRole` | One template model, roles (so the OS supplies label, shortcut, behaviour), ids not closures on the wire, a default menu when the app sets none |
| Tray | `tray-icon`: icon, tooltip, title, menu, `menuOnLeftClick`, events `Click{button,state}`, `DoubleClick`, `Enter/Move/Leave` with rect; `iconAsTemplate` on macOS | `Tray`: `setImage`, `setToolTip`, `setTitle`, `setContextMenu`, `click`, `right-click`, `double-click`, template images by `Template` file suffix | `QSystemTrayIcon::isSystemTrayAvailable()`, `activated(reason)`; Flutter `tray_manager`: `onTrayIconMouseDown`, `onTrayMenuItemClick` | Template images on macOS, availability query, click/double-click/right-click events with bounds, menu on left click optional |
| Window | window plugin + `window-state` (persist x, y, size, maximized, fullscreen per label, clamp to monitors) | `BrowserWindow` options: `frame`, `titleBarStyle`, `trafficLightPosition`, `transparent`, `vibrancy`, `alwaysOnTop`, `minWidth`... | `window_manager`: `setTitleBarStyle`, `setAlwaysOnTop`, `setOpacity`, `setPreventClose` + `onWindowClose` | Options at creation (frameless, transparent need it) and setters later, `preventClose` handshake, state persistence with monitor clamping, one `label` per window |
| Global shortcut | `global-shortcut` (Carbon hotkeys on macOS, X11 grabs, no Wayland) | `globalShortcut.register(accelerator, cb)`, returns bool, `isRegistered` | `hotkey_manager` | Accelerator strings, returns a status (conflict, denied), and an explicit Wayland caveat |
| Dialogs | `plugin-dialog`: `open`, `save`, `message`, `ask`, `confirm`, filters, defaultPath, multiple, directory | `dialog.showOpenDialog / showSaveDialog / showMessageBox`, sheet when given a window | SDL3 `SDL_ShowOpenFileDialog` (async callback), `SDL_ShowSimpleMessageBox` | Promises, filters, sheets on macOS |
| Single instance | `single-instance`: second launch calls the first with `(args, cwd)` then exits | `app.requestSingleInstanceLock()` + `second-instance` event | - | Same contract |
| Deep link | `deep-link`: schemes declared in config, `getCurrent()`, `onOpenUrl`; macOS needs a bundle, Linux registers a `.desktop` at runtime (`register`) | `app.setAsDefaultProtocolClient`, `open-url` (macOS), argv (Linux) | - | Declared in the manifest, `getCurrent` for the cold start, `register()` for dev on Linux |
| Autostart | `autostart` (auto-launch crate: LaunchAgent / login item, XDG `.desktop`) | `app.setLoginItemSettings` | - | `SMAppService` on macOS 13+, LaunchAgent fallback, XDG autostart |
| Badge, dock | no first-class API (community) | `app.setBadgeCount`, `app.dock.setBadge/bounce/setMenu` | - | `dock.setBadge`, `bounce`, dock menu; Linux Unity LauncherEntry signal |
| Power | none | `powerMonitor`: suspend, resume, lock-screen, unlock-screen, on-ac, on-battery, `getSystemIdleTime`; `powerSaveBlocker` | - | The same event names, idle time, sleep blocker |
| Permissions | Capability files (`windows`, `platforms`, `permissions: ["notification:allow-notify"]`), scopes, deny by default; capabilities of several files merge | none (trusted main process); `contextIsolation` + preload are the boundary | Qt: none; Flutter: per-platform manifests | Deny by default, ids `feature:operation`, per-target lists, scopes for fs/urls, checked at compile time **and** natively |
| Updates | updater plugin (signed manifests) | `autoUpdater` (Squirrel.Mac, Sparkle-like) | - | Non-goal here (section 10) |

Two facts that shape everything:

1. macOS notifications go through `UNUserNotificationCenter`, which **requires a bundle identifier** (an unbundled binary throws or silently drops) and, per Electron, a code-signed app. The older `NSUserNotification` is deprecated and removed from current SDK use: not used.
2. The menu bar, the dock and the tray name an app by its `CFBundleName` and icon. An unbundled dev binary shows the executable name and a generic icon. Tauri, Electron, Flutter all accept this in dev; Zinc can do better cheaply (section 5.1).

## 2. Where Zinc stands today

- Plugin model: `plugins/<name>/plugin.json` (`kind: module`, `module: "zinc:x"`, `entry`, `targets.<id>.{sources,pkg,frameworks}`), natives declared by a `*.spec.ts` + `x.host.cpp`/`x.macos.cpp`, a thunk generated by `zinc native-gen --thunk`, built into `~/.zinc/cache/<target>/plugins/` (native ABI report, ZN-096/099/101). `plugins/webview` already builds an Objective-C++ file (`src/webview.mm`) with `frameworks: ["WebKit","Cocoa"]` and reads the SDL window through `hal_window_handle()`. Per-target stand-ins exist (`process.sim.ts`, `process.next.ts`).
- ABI: a module is `ZnModule{init, poll, shutdown, exports}`; callbacks (`c(sig)`, `cb_post` thread-safe) and promises (`P<t>`) work from programs since ZN-167. So events can come from any native thread and are run by the loop (`host.nativePoll` each turn).
- Window: `targets/macos/hal_sdl.cpp` calls `SDL_CreateWindowAndRenderer(title, w, h, RESIZABLE | HIGH_PIXEL_DENSITY)` (no properties, so no frameless/transparent/always-on-top at creation), handles quit, fullscreen (F11), always-on-top only in kiosk mode, clipboard text, cursor, text input. `HalConfig` has only `{width, height, title, gfx}`. Frames are software pixels `0x00RRGGBB` presented through an SDL renderer texture (no alpha).
- Headless: `ZINC_HEADLESS`, `ZINC_DETERMINISTIC`, `ZINC_RECORD/REPLAY` select the null HAL in `src/host/hal_dispatch.cpp`; `ZINC_INPUT=file` scripts pointer/keys per frame (`<frame> <event>`). This is the pattern to copy.
- Capabilities: `targets/capabilities.json` (macos, linux, rpi1, rmpp, esp32, ps1, ps2, wasm, sim) checked against `requires` in zinc.json, plugin.json and `@requires`.
- SDL3 3.4.16 is vendored and built with `AUDIO CAMERA GPU HAPTIC HIDAPI JOYSTICK SENSOR POWER DIALOG TRAY VULKAN` off. Its tray (`src/tray/cocoa/SDL_tray.m`, NSStatusItem) has no click callback, no template flag, no title; on Linux (`src/tray/unix/SDL_tray.c`) it needs GTK3 and `libayatana-appindicator`, which it `dlopen`s (absent on stock GNOME/Wayland). Its dialogs (`src/dialog`) are NSOpenPanel on macOS and xdg-desktop-portal or zenity on Linux: good.
- There is no `permissions` key and no `app` identity (bundle id, name, version, icon) in zinc.json.

## 3. Decision: one plugin, narrow native ABI, many typed modules

Options scored with the RULES.md section 4 weights (fit x3, performance x3, size x2, maintainability x2, licence x2, portability x1, effort x1; max 70):

| Option | Fit | Perf | Size | Maint | Licence | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| **A. One plugin `system` (`modules`: `zinc:system`, `zinc:system/notification`, ...), one native module with an op-dispatch ABI, backends macOS / Linux / sim** | 5 | 4 | 4 | 5 | 5 | 4 | 3 | **62** |
| B. One plugin per feature (notification, tray, menu...) | 4 | 4 | 5 | 3 | 5 | 4 | 2 | 56 |
| C. SDL3 only (switch SDL_TRAY and SDL_DIALOG on) | 2 | 4 | 5 | 5 | 5 | 5 | 5 | 58 |
| D. Code in the engine host (`src/host`) | 2 | 4 | 3 | 2 | 5 | 4 | 3 | 45 |

Why A: the features share state that must have exactly one owner per process (the NSApplication delegate and its dock-menu / URL / reopen callbacks, the D-Bus connection and its name, the event queue, the permission list, the recording simulator). B would duplicate and fight over those. C cannot do notifications, app menu, badge, shortcuts, template icons or tray clicks. D breaks the "agnostic core" rule. A still uses SDL3 where SDL is enough (dialogs, window properties, drop, open URL, power, clipboard data).

The plugin is `plugins/system`, `kind: module`, `modules` listing one TS entry per feature so an app pays only for what it imports (the `three` plugin already registers several specifiers). Native surface is deliberately three functions, so the ABI never churns when a feature is added:

```ts
// plugins/system/native/system.spec.ts
export function call(op: string, json: string): string;          // sync: set/get something, returns JSON
export function callAsync(op: string, json: string): Promise<string>;  // dialogs, notification permission, popup menu
export function onEvent(cb: (event: string) => void): void;      // JSON events, posted with cb_post
```

Reasons: one table `ops.json` (op, permission id, params schema, supported targets) generates the TS typings, the permission gate and the simulator's log format. The recording simulator is then trivially exact: it logs `op + json`. Cost: a JSON encode per call, irrelevant at this rate (notification, menu rebuild; never per frame). Window drag/hit-testing that must run per frame stays out of this path (HAL, section 4.4).

Backends (one file each, chosen at load, behind one C++ interface `SystemBackend { call, callAsync, poll }`):

| Backend | Selected when | Code |
|---|---|---|
| `sim` | `ZINC_DETERMINISTIC`, `ZINC_HEADLESS`, `ZINC_SYSTEM=sim`, target `sim`, or no GUI session | C++, records and scripts (section 7) |
| `macos` | live HAL on macOS | `src/system_macos.mm` (AppKit, UserNotifications, ServiceManagement, Carbon HIToolbox, IOKit, CoreGraphics) |
| `linux` | live HAL on Linux | `src/system_linux.cpp` (+ `dbus.cpp`: `dlopen("libdbus-1.so.3")`, about 25 functions declared in our own header, so no GPL/AFL header is vendored) |
| `stub` | target without the capability (`.next.ts` stand-in in TS, like process) | all calls reject `unsupported`, `isSupported()` false |

Events reach the UI loop as one ordered stream: the backend appends to a thread-safe queue (macOS callbacks run on the main thread inside SDL's event pump or on UN's private queue), `cb_post` hands them to the loop, and `zinc:system` dispatches to typed listeners at the start of the loop turn, before the frame callback. In deterministic mode only the script produces events, at an exact frame number, so runs reproduce.

Native library choices (licence column follows RULES.md section 3):

| Need | macOS | Linux | Library | Licence |
|---|---|---|---|---|
| Notifications | UNUserNotificationCenter (+ `osascript` fallback, section 5.1) | `org.freedesktop.Notifications` (`Notify`, `ActionInvoked`, `NotificationClosed`, `GetCapabilities`) | system frameworks; libdbus-1 by dlopen | OS / AFL-2.1 or GPL-2+ (dlopen, never linked) |
| App menu, context menu, dock menu | NSMenu | drawn by the UI kit from the same model (section 6) | AppKit | OS |
| Tray | NSStatusItem (own code: template image, title, click events) | StatusNotifierItem + `com.canonical.dbusmenu` over libdbus; SDL tray as spike fallback | AppKit; libdbus-1 | OS |
| Dialogs | SDL3 (NSOpenPanel / NSSavePanel); NSAlert sheet for message boxes | SDL3 (xdg-desktop-portal FileChooser, zenity fallback) | SDL3 3.4.16 (already vendored, switch `SDL_DIALOG` on) | zlib |
| Window | SDL3 properties + NSWindow via `SDL_PROP_WINDOW_COCOA_WINDOW_POINTER` | SDL3 (X11/Wayland) | SDL3 | zlib |
| Global shortcuts | Carbon `RegisterEventHotKey` (no Accessibility permission) | X11 `XGrabKey` (dlopen libX11); Wayland `org.freedesktop.portal.GlobalShortcuts` | system | OS / MIT (libX11, dlopen) |
| Single instance | flock + unix socket in `~/Library/Application Support/<id>/` | flock + socket in `$XDG_RUNTIME_DIR` | libuv 1.53.0 (vendored) | MIT |
| Autostart | `SMAppService.mainApp` (13+), else LaunchAgent plist | `~/.config/autostart/<id>.desktop` | none | - |
| Deep link, file open | `CFBundleURLTypes` + `NSAppleEventManager` `kAEGetURL`; `application:openFiles:` (SDL turns it into `SDL_EVENT_DROP_FILE`) | `.desktop` `MimeType=x-scheme-handler/...` + `xdg-mime`; argv; forwarded by single-instance | none | - |
| Reveal / open URL | `NSWorkspace activateFileViewerSelectingURLs`, `SDL_OpenURL` | `org.freedesktop.FileManager1.ShowItems`, `SDL_OpenURL` | SDL3 | zlib |
| Power, idle, appearance | `NSWorkspace` sleep/wake/session notifications, `CGEventSourceSecondsSinceLastEventType`, IOKit assertions, `SDL_GetPowerInfo`, `SDL_EVENT_SYSTEM_THEME_CHANGED` | logind `PrepareForSleep`, `Inhibit`; `org.freedesktop.ScreenSaver` / Mutter IdleMonitor; SDL power | SDL3 (switch `SDL_POWER` on) | zlib |
| Badge, progress | `NSApp.dockTile.badgeLabel` | `com.canonical.Unity.LauncherEntry` signal | - | - |
| Rich clipboard | NSPasteboard | SDL3 clipboard data (`SDL_SetClipboardData`) | SDL3 | zlib |

Score for the Linux D-Bus access (the only real library choice): libdbus-1 by dlopen with our own prototypes 4.0 (fit 5, perf 5, size 5, maintainability 3, licence 4, portability 4, effort 3 weighted: 15+15+10+6+8+4+3=61/70); sd-bus via `libsystemd.so.0` dlopen 3.6 (nicer API, absent on Alpine/Void, LGPL); GDBus 3.2 (drags glib); sdbus-c++ 3.0 (LGPL, needs a link); a hand-written D-Bus client 2.0 (reinvents, RULES.md forbids). Chosen: libdbus-1.

## 4. TypeScript API

All modules are `zinc:system/<feature>`; `zinc:system` re-exports small shared parts. Types use plain TS (the `i32` aliases of the std lib apply inside plugins). Every call that cannot work on the current target returns/rejects with `SystemError{code: 'unsupported' | 'denied' | 'failed', message}`; `isSupported()` never throws.

### 4.1 `zinc:system` (core, available on every target)

```ts
import { system } from 'zinc:system';
system.supports('tray');            // boolean, from zinc:platform capabilities + the runtime host (Linux tray host present?)
system.app;                         // { id, name, version, bundled: boolean, dataDir, configDir, cacheDir }
system.on('second-instance' | 'open-url' | 'drop' | 'power' | 'appearance' | 'reopen', handler);   // typed overloads per event
system.quit(code?: number);         // runs 'before-quit' listeners (may veto once with e.prevent()), then exits
system.keepAlive(true);             // do not quit when the last window closes (tray apps)
```

### 4.2 `zinc:system/notification`

```ts
import { notification } from 'zinc:system/notification';

const perm = await notification.requestPermission();      // 'granted' | 'denied' | 'unsupported'  (macOS shows the OS prompt once)
const n = await notification.show({
  id: 'build-42',                 // same id replaces (macOS identifier, Linux replaces_id)
  title: 'Build finished', subtitle: 'zinc', body: '3 warnings',
  icon: 'assets/ok.png', sound: 'default' /* or false */, urgency: 'normal',      // urgency/timeout: Linux only
  actions: [{ id: 'open', title: 'Open' }, { id: 'dismiss', title: 'Dismiss' }],
  reply: { placeholder: 'Reply...' },                      // macOS only
  group: 'builds',
});
n.onClick(() => window.show());
n.onAction(id => ...);  n.onReply(text => ...);  n.onClose(reason /* 'user' | 'timeout' | 'app' */ => ...);
notification.cancel('build-42');  await notification.delivered();  // [{id,title,...}]
notification.backend;   // 'native' | 'osascript' | 'dbus' | 'none': tells the app which tier it got
```

macOS rule set: `UNUserNotificationCenter` only when the process has a bundle id (a dev bundle counts, section 5.1); otherwise `osascript -e 'display notification ... with title ...'` (no actions, no click event, no icon, shown under Script Editor): `backend = 'osascript'`. `show` never fails silently: it resolves with `delivered: false` and a reason when permission is denied. Linux: capabilities are read once (`GetCapabilities`); actions are dropped when the server lacks `actions`.

### 4.3 `zinc:system/menu`

One serializable model, ids not closures (the wire is JSON; handlers register by id on the TS side):

```ts
import { menu, Menu } from 'zinc:system/menu';

menu.setApp([
  { role: 'appMenu' },                                         // About, Services, Hide, Quit with the OS labels (macOS); File > Quit elsewhere
  { label: 'File', submenu: [
      { id: 'new',  label: 'New',  accelerator: 'CmdOrCtrl+N' },
      { id: 'open', label: 'Open...', accelerator: 'CmdOrCtrl+O' },
      { type: 'separator' },
      { id: 'autosave', label: 'Autosave', type: 'checkbox', checked: true },
      { role: 'close' } ] },
  { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
]);
menu.onClick('open', e => openFile());                         // e: { id, source: 'app'|'context'|'tray'|'dock', checked? }
menu.update('autosave', { checked: false, enabled: true, label: '...' });   // by id, no rebuild
menu.default();                                                // appMenu + editMenu + viewMenu + windowMenu built from system.app.name (applied when the app sets none)

const picked = await menu.popup([{ id: 'copy', label: 'Copy' }, { role: 'paste' }], { x, y });  // context menu: id | null
```

Item fields: `id, label, sublabel, role, type ('normal'|'separator'|'checkbox'|'radio'|'submenu'), accelerator, enabled, visible, checked, icon, submenu`. Roles (Electron/muda vocabulary): `about, quit, hide, hideOthers, unhide, services, minimize, zoom, front, close, togglefullscreen, undo, redo, cut, copy, paste, selectAll` + the menu roles `appMenu, fileMenu, editMenu, viewMenu, windowMenu, help`. Key rules:

- Window and app roles (`quit, hide, minimize, zoom, front, about, togglefullscreen, services`) are native AppKit selectors. **Edit roles are not**: Zinc text fields are not NSTextViews, so `copy/paste/...` post a `{type:'menu', id:'role:copy'}` event that the UI kit's focus system already handles as a command (same code path as the Cmd+C key today). A key accelerator that belongs to a menu item is consumed by AppKit before SDL sees it: the app gets the menu event, never both (the kit maps both to one command so a text field works in either case).
- Accelerator grammar: `Mod+Mod+Key`, `CmdOrCtrl`, `Cmd`, `Ctrl`, `Alt`/`Option`, `Shift`, `Super`; keys: A-Z, 0-9, F1-F24, named (`Space`, `Enter`, `Plus`, `Left`...). One parser, in TS, shared with `shortcut` and with the kit's in-window handling.
- macOS: the menu is `NSApp.mainMenu`, replacing SDL's built-in minimal one; the app name is `CFBundleName`/`system.app.name`.
- Linux: no global menu bar is assumed. `menu.setApp` stores the model; `<MenuBar/>` of the UI kit draws it (section 6). `menu.popup` is native on macOS (`NSMenu popUpMenuPositioningItem` in the window's content view at (x, y) in the program's units, where its pointer events are; blocks frames while tracking; the HAL redraws through the existing `zrt_redraw` as for live resize) and kit-drawn elsewhere. `menu.native` tells which.

### 4.4 `zinc:system/tray`

```ts
import { tray } from 'zinc:system/tray';

if (tray.isAvailable()) {                       // Linux: a StatusNotifierWatcher with a host exists; macOS: true
  const t = await tray.create({
    id: 'main',
    icon: 'assets/tray.png',                    // @2x picked automatically; macOS: a file named *Template.png, or template: true
    template: true,                             // macOS: monochrome, auto light/dark
    tooltip: 'Zinc', title: '3',                // title: text next to the icon (macOS), label (some Linux hosts)
    menu: [{ id: 'show', label: 'Show' }, { type: 'separator' }, { role: 'quit' }],
    menuOnLeftClick: true,                      // false: left click is only an event, menu on right click (macOS: menu is shown programmatically)
  });
  t.onClick(e => window.toggle());              // e: { button: 'left'|'right'|'middle', double: boolean, bounds: {x,y,w,h} }
  t.setIcon(...); t.setTitle(...); t.setMenu(...); t.destroy();
}
```

On macOS the status item needs `NSApp.activationPolicy`: `app.dock: false` in the manifest sets `LSUIElement` (no dock icon, tray-only apps). Linux without a host: `isAvailable()` false and `create` rejects `unsupported`; the app is expected to fall back (e.g. keep the window). Icons cross as PNG bytes (ARGB `IconPixmap` on Linux, `NSImage` on macOS), from the baked asset table of `src/res` (no file path at run time).

### 4.5 `zinc:system/window`

Creation options live in `zinc.json` (they must be known before the window exists), setters at run time:

```jsonc
"app": { "window": { "title": "Notes", "width": 1100, "height": 720, "minWidth": 640, "frame": true,
  "titleBar": "overlay",            // "default" | "hidden" (no title text) | "overlay" (content under a transparent title bar, macOS) | "none" (frameless, every OS)
  "trafficLights": { "x": 18, "y": 20 }, "alwaysOnTop": false, "transparent": false, "vibrancy": null,
  "persist": true }}                // restore position/size/maximized/fullscreen
```

```ts
import { window } from 'zinc:system/window';
window.setTitle('x'); window.setSize(w, h); window.setPosition(x, y); window.center();
window.setAlwaysOnTop(true); window.setOpacity(0.9); window.setMinSize(w, h);
window.setFullscreen(true); window.maximize(); window.minimize(); window.hide(); window.show(); window.focus();
window.setTrafficLights({ x: 18, y: 20 });      // macOS, reapplied on resize/fullscreen (AppKit resets them)
window.setVibrancy('sidebar');                  // macOS: NSVisualEffectView material; needs transparent: true (spike S2)
window.setDragRegion(rects);                    // frameless: rectangles that move the window (SDL_SetWindowHitTest); resize edges 6 px
window.onCloseRequested(e => { e.prevent(); window.hide(); });   // close-to-tray
window.on('moved' | 'resized' | 'focus' | 'blur' | 'fullscreen' | 'scale-changed', handler);
window.state();                                  // { x, y, w, h, maximized, fullscreen, display }
const w2 = await window.create({ label: 'inspector', url: ..., width: 400, height: 600 });   // multiple windows: section 8, capability `multiwindow`
```

Persistence (Tauri window-state practice): written on `moved/resized` with a 400 ms debounce and at quit to `<dataDir>/window-state.json` keyed by label; restore clamps to the union of current displays (a removed monitor must not leave the window off-screen) and ignores a saved fullscreen on a different display. Not in the manifest unless `persist` is true, so existing demos keep their size.

HAL change (small, additive, weak defaults for other HALs): `HalConfig` gains `HalWindowConfig*`; `hal_sdl.cpp` switches to `SDL_CreateWindowWithProperties` (BORDERLESS, TRANSPARENT, ALWAYS_ON_TOP, X/Y, MIN sizes) + `SDL_CreateRenderer`, and exports `hal_close_requested()` (weak, true = quit) so `onCloseRequested` can veto the SDL quit. Drop events (`SDL_EVENT_DROP_FILE/TEXT/POSITION`) are watched by the plugin through its own `SDL_AddEventWatch` (same mechanism as the HAL's), so `HalInput` stays unchanged.

### 4.6 `zinc:system/dialog`

```ts
import { dialog } from 'zinc:system/dialog';
const files = await dialog.open({ title: 'Open', multiple: true, directory: false, defaultPath: dir,
                                  filters: [{ name: 'Markdown', extensions: ['md', 'txt'] }] });   // string[] | null
const path  = await dialog.save({ defaultPath: 'untitled.md', filters: [...] });                    // string | null
const r = await dialog.message({ kind: 'warning', title: 'Delete?', message: '...', detail: '...',
                                 buttons: ['Delete', 'Cancel'], defaultButton: 1, cancelButton: 1 }); // index
await dialog.confirm('Quit without saving?');   // boolean (sugar over message)
```

macOS shows file dialogs as sheets of the window when possible. Picked paths are added to the **fs scope** for the session (section 5.3) so an app limited to `fs: "user-picked"` can read exactly those files.

### 4.7 Shortcuts, instance, deep link, autostart, opener, power, clipboard, dock

```ts
import { shortcut } from 'zinc:system/shortcut';
const ok = await shortcut.register('CmdOrCtrl+Shift+Space', e => toggle());   // 'ok' | 'conflict' | 'denied' | 'unsupported' (Wayland without portal)
shortcut.unregister('CmdOrCtrl+Shift+Space');

import { instance } from 'zinc:system/instance';
await instance.lock({ onSecond: ({ argv, cwd }) => { window.show(); open(argv); } });  // false: another instance holds it, it was told, you should exit

import { deepLink } from 'zinc:system/deep-link';
const initial = deepLink.current();                 // urls that launched the app (cold start)
deepLink.onOpen(urls => route(urls[0]));
await deepLink.register('notes');                   // Linux dev: writes the .desktop + xdg-mime; macOS: bundled apps only (schemes come from the manifest)

import { autostart } from 'zinc:system/autostart';
await autostart.enable({ hidden: true }); await autostart.isEnabled(); await autostart.disable();

import { opener } from 'zinc:system/opener';
opener.openUrl('https://...'); opener.openPath(p); opener.reveal(p);            // scoped by permission opener:*

import { power } from 'zinc:system/power';
power.on('suspend' | 'resume' | 'lock' | 'unlock' | 'idle' | 'active' | 'ac' | 'battery', cb);
power.idleSeconds(); power.battery();                // { percent, charging } | null
const lock = power.preventSleep('display' | 'system', 'exporting');  lock.release();

import { clipboard } from 'zinc:system/clipboard';  // text stays the HAL path (ui.ts keeps working)
await clipboard.readImage(); clipboard.writeImage(png); clipboard.readFiles(); clipboard.writeHtml(html, text);

import { dock } from 'zinc:system/dock';
dock.setBadge('3'); dock.bounce('informational' | 'critical'); dock.setMenu([...]); dock.setProgress(0.4);  // Linux: badge + progress via Unity LauncherEntry
```

`system.appearance` (`{dark, accent}` and the `appearance` event) comes from `NSApp.effectiveAppearance` / `SDL_GetSystemTheme`.

## 5. Bundle, dev mode, permissions

### 5.1 App identity and bundle (macOS)

`zinc.json` gets one `app` object (id, name, version, icon, copyright, category, `dock`, `urlSchemes`, `fileTypes`, `window`). `zinc build --bundle` writes `<name>.app` with `Info.plist` (CFBundleIdentifier, CFBundleName, CFBundleShortVersionString, `LSUIElement`, `CFBundleURLTypes`, `CFBundleDocumentTypes`, `NSHighResolutionCapable`, `LSMinimumSystemVersion`), `icon.icns` (from the PNG, `iconutil` is on every Mac; no library), the engine/app binary, and signs it ad hoc (`codesign --force --sign -`; `--sign <identity>` and notarization are manual-by-owner steps, recorded as commands, never run automatically, RULES.md section 2 last line). Linux `--bundle` writes an AppDir with the `.desktop` file and icon (AppImage later).

**Dev bundle** (decision, spike S1): on macOS, when the program imports any `zinc:system/*` module and `app.id` exists, `zinc run` executes the engine from a cached bundle `~/.zinc/cache/macos/devapp/<app.id>.app` (hard link or copy of the engine binary + the generated Info.plist, ad-hoc signed once, about 10 ms to refresh). The process then has a bundle id, name and icon, so UNUserNotificationCenter, the app-menu title, the dock icon, URL schemes and the tray behave exactly as in the shipped app. This is the approach Electron uses (it always runs inside `Electron.app`) and costs nothing the user sees. Fallbacks: `osascript` for notifications only, and nothing for the rest. Linux: first `zinc run` installs `~/.local/share/applications/<app.id>.desktop` (Exec = the dev command) so GNOME/KDE show the right name and icon and `desktop-entry` hints work; removed by `zinc clean`.

### 5.2 Permissions model (Tauri capabilities, simplified)

Zinc apps are one trust domain, so no per-window scoping; there is deny-by-default and per-target scoping:

```jsonc
"permissions": ["notification", "tray", "menu", "dialog", "window:state", "shortcut", "autostart",
                "instance", "deep-link", "dock", "power", "clipboard:rich", "opener"],
"scopes": { "opener": { "allow": ["https://*", "mailto:"] }, "fs": "user-picked" },
"targets": { "linux": { "permissions": ["-autostart"] } }          // '-' removes for that target
```

- Ids are `feature` (all operations) or `feature:operation`; the op table of section 3 maps every op to exactly one id. No `permissions` key = **no** system module usable (existing demos use none).
- Enforced twice: the compiler rejects `import 'zinc:system/tray'` without `tray` (diagnostic names the id and the line to add), and the native host refuses an op whose id was not compiled in (`ZP_SYSTEM_PERMISSIONS` define; protects `webview` pages and `script` code that call through `invoke`). Pages of `zinc:webview` get no system permission unless `webview.permissions` lists ids.
- `targets/capabilities.json` gets keys `desktop`, `notifications`, `tray`, `menubar`, `dialogs`, `windowctl`, `multiwindow`, `shortcuts`, `instance`, `autostart`, `deeplink`, `power`: macos all true; linux true except `tray` and `shortcuts` = `"optional"` (depends on the session: tray host, Wayland portal); sim true (recording backend); rpi1, rmpp, esp32, ps1, ps2, wasm false. A feature is *requested* by a permission and *resolved* by the capability: on a false target the stub backend answers `unsupported` and the build does not fail, unless the app says `"requires": ["tray"]`. That keeps "all demos unchanged on every target".
- OS-level consent is separate and surfaced, never hidden: notification authorisation (prompt on first `requestPermission`), login item approval (macOS 13 shows "Added Login Item"), nothing for Carbon hotkeys. Accessibility/Automation permissions are never required by the product (only a test harness may ask for them, section 7.3).

## 6. UI kit, fallbacks per platform

| Feature | macOS | Linux X11/Wayland | Pi, ESP32, rmpp, PS, wasm |
|---|---|---|---|
| Notification | native / osascript | D-Bus; none when no daemon (`backend: 'none'`, `show` resolves `delivered:false`) | stub |
| App menu | native menu bar | `<MenuBar/>` in the window (kit); global DBusMenu is not attempted | stub; the kit menu still works in-window |
| Context menu | native | kit overlay | kit overlay (touch long-press) |
| Tray | native | SNI when a watcher+host exists (KDE, XFCE, GNOME with AppIndicator extension, others); else `isAvailable()` false | stub |
| Dock badge/menu | native | Unity LauncherEntry (KDE, Dash to Dock); else ignored | stub |
| Global shortcut | Carbon | X11 grab; Wayland through the GlobalShortcuts portal (GNOME 48+, KDE); else `unsupported` | stub |
| Transparent window/vibrancy | yes (spike S2) | transparent needs a compositor; vibrancy no-op | stub |

Kit work (separate from the plugin): `MenuBar`, `ContextMenu` and `MenuItem` components in `lib/std/kit` render the `zinc:system/menu` model when `menu.native` is false, including accelerators and keyboard navigation, so the same app code works everywhere.

## 7. Test strategy

### 7.1 Recording simulator (T0, no desktop)

Backend `sim` implements every op, keeps in-memory state (menus, tray items, notifications, shortcuts, window state) so reads like `notification.delivered()` and `menu.update` behave, and writes one line per call to the **system log**: stdout channel `[system] <op> <json>` when `ZINC_SYSTEM_LOG=-`, or a file (`ZINC_SYSTEM_LOG=path`). JSON has sorted keys and no timestamps, so it is golden-comparable. Frame stamps `@<n>` precede lines in scripted runs.

Scripted events, same style as `ZINC_INPUT`: `ZINC_SYSTEM_SCRIPT=file`, one line per event, `<frame> <event>`:

```
3  menu-click open
4  tray-click left            # also: tray-click right | tray-double | tray-menu-click show
5  notification-click build-42   # also: notification-action build-42 open | notification-reply build-42 "text" | notification-close build-42 user
6  shortcut CmdOrCtrl+Shift+Space
7  drop /tmp/a.md /tmp/b.png
8  open-url notes://doc/1
9  second-instance --foo
10 power suspend            # resume, lock, unlock, idle, active, battery, ac
11 appearance dark
12 window close-requested   # moved 10 10, resized 800 600, fullscreen on
13 dialog-answer /tmp/x.md  # queued answers for dialog.open/save; "cancel"; message: button index
```

A dialog with no queued answer resolves as cancel (never blocks). Unknown event lines are errors in the log (typo safety).

Test layout: `tests/t0/system_sim.sh` runs `tests/golden/system/*.ts` with their `.script` and compares stdout against `.expected` (interpreter and AOT, as other goldens do). Cases: notification request fields (title, actions, group, replace id), permission denied path, menu template with roles and accelerators incl. the parsed accelerator, `menu.update`, popup answered by script, tray create/click/menu click, dock badge, window options from the manifest (`ZINC_SYSTEM_LOG` shows the creation request), state persistence round trip (a temp data dir), shortcut conflict, single-instance second launch, deep-link cold start, permission compile errors (`diagnostics` golden), stub target output (`--target esp32` build prints `unsupported`). `tests/t0/system_ops.sh` checks that `ops.json`, the TS typings, the permission table and both backends list the same ops (drift guard).

### 7.2 Real backends, no human

- macOS (T2 `desktop`, run on a GUI Mac, tagged so CI skips): `ZINC_SYSTEM_SELFTEST=1` makes the real backend dump the live state as JSON at exit, read back from the OS itself: `NSApp.mainMenu` tree (titles, key equivalents, enabled, state), `NSStatusItem.button` title/image size/`isTemplate`, `UNUserNotificationCenter getDeliveredNotificationsWithCompletionHandler`, `NSApp.dockTile.badgeLabel`, `NSWindow` frame and style mask, registered hotkey count. Menu items are fired with `performActionForItemAtIndex:`, so the whole callback path (AppKit -> queue -> TS handler) is exercised without Accessibility permission. Compared with the same golden idea as the simulator, field by field.
- Pixels: `screencapture -x -R<x,y,w,h> out.png` of the menu-bar region at the status item frame (read from the selftest), and `screencapture -l <windowid>` for window chrome (titlebar overlay, traffic-light position, vibrancy); compared by the existing image-diff tool with a tolerance, saved under `tests/golden/system/mac/` as references on first approval by a task (not by a person: the first run records, the next runs compare).
- Where permitted: `osascript -e 'tell application "System Events" to tell process "<name>" to get name of every menu bar item of menu bar 1'` and `click menu item` double-check the real menu from outside. It needs Accessibility for the terminal app; the test skips with a message when `AXIsProcessTrusted` is false, it is never a gate.
- Linux (T1 container job, no display): `dbus-run-session` with a mock `org.freedesktop.Notifications` server (python-dbusmock or `dunst` + `dunstctl history`) to assert `Notify` arguments and to emit `ActionInvoked`; a mock `org.kde.StatusNotifierWatcher` + `StatusNotifierHost` to assert SNI properties (`IconPixmap`, `Menu` layout via `GetLayout`) and to send `Activate` / `ContextMenu`; logind mock for `PrepareForSleep`. Xvfb only for window-option checks (`xprop`, `xwininfo`: `_NET_WM_STATE_ABOVE`, frameless hints).
- Failure paths are tests too: no daemon (`backend: 'none'`), no watcher, permission denied, unbundled macOS run (`osascript` tier), second instance when the socket is stale.

### 7.3 Documentation of the live check

`docs/desktop-integration.md` (written by task SYS-19) lists the exact commands above so a loop run can repeat them.

## 8. Risks and spikes

| # | Risk or question | Spike (done by a task, on this Mac unless noted) | If it fails |
|---|---|---|---|
| S1 | Does a cached, ad-hoc-signed dev bundle copy of the engine get a working UNUserNotificationCenter (authorisation prompt, delivered readback), correct app-menu title and dock icon? Does hard-linking keep the code signature valid? | Build the bundle by script, run a 30-line `.mm` and the real plugin, read back state | `osascript` tier for dev; real notifications only in `--bundle` builds signed with a real identity (owner command recorded) |
| S2 | Transparent window and vibrancy with software frames: SDL_Renderer texture needs ARGB with premultiplied alpha, but `zinc:gfx` frames are `0x00RRGGBB`; `SDL_WINDOW_TRANSPARENT` + `NSVisualEffectView` below the metal layer | Test window with a clear alpha texture over a vibrancy view; measure the cost of a premultiplied path | Ship `transparent` without vibrancy first; vibrancy depends on the GPUI/Skia-class renderer tasks (ZN-170+) which will produce alpha frames anyway |
| S3 | Linux SNI + dbusmenu from libdbus by dlopen: correct on KDE, XFCE, GNOME + AppIndicator extension; icon updates, menu `LayoutUpdated` | Container with `sni-watcher` mock plus a KDE/Plasma-free check against the spec; compare with SDL's appindicator tray as a fallback | Enable SDL_TRAY (dlopen of appindicator) as a documented second path (menu entries only, no click events) |
| S4 | SDL_DIALOG on: callback thread, `SDL_ShowOpenFileDialog` on macOS runs on the main thread and needs the loop pumping; cancel and multiple selection; filters with several extensions; sheet attachment via `SDL_PROP_FILE_DIALOG_WINDOW_POINTER` | Turn the option on in a scratch build, drive with the sim and by hand-free `ZINC_SYSTEM_SELFTEST` | NSOpenPanel directly in `system_macos.mm` (about 60 lines) |
| S5 | Dock menu and URL/reopen events need the NSApplication delegate; SDL owns it (`SDLAppDelegate`). Wrapping with a forwarding delegate (`forwardingTargetForSelector:`) vs `class_addMethod` on SDL's class; cold-start `kAEGetURL` before our init | Register at plugin init and at `zinc` start; launch with `open notes://x` | Register the Apple Event handler from the HAL (before `SDL_Init` returns) through a weak hook |
| S6 | Native menu accelerators swallow key events that the kit also handles (Cmd+C/V/Z/A in text fields; Cmd+Q, Cmd+W) | Run the hero and notes examples with the default menu; check each shortcut fires one command | Menu roles for edit commands omit `keyEquivalent` and let the key path act (menu shows the shortcut text via `NSMenuItem.keyEquivalent` + `keyEquivalentModifierMask` only for non-text commands) |
| S7 | Popup menu blocks frames (modal tracking) | measure frame stalls and live animation behind the menu; use the HAL redraw hook | Kit-drawn context menu on macOS too, native only for app menu and tray |
| S8 | Multiple windows: one `zinc:gfx` surface per process | design only; depends on the render architecture's per-view retained scene (docs/reports/ui-rendering-architecture.md) | Single window + kit-drawn panels/popups; secondary windows only for dialogs and tray popovers |
| S9 | Wayland: no global shortcuts without the portal, no window positioning, no `always on top`; tray depends on the shell | Document and answer `unsupported`; test under a Wayland session container (weston) | none needed: `supports()` reports it |
| S10 | JSON op ABI hides types from the C++ thunk generator | prototype `native-gen` on the three-function spec; generated typings from `ops.json` | one spec function per op group |
| S11 | `LSUIElement` apps and `NSApp.setActivationPolicy` before the SDL window exists | set from Info.plist in bundles; in the dev bundle by generated plist | n/a |

General risks: AppKit calls must run on the main thread (the backend marshals with `dispatch_async(main)` when called from a worker, and `callAsync` results go through `promise_resolve`); NSMenu/NSStatusItem objects must be retained by the backend, never by a transient TS handle; Linux D-Bus connection is shared and polled in the plugin's `poll` (non-blocking `dbus_connection_read_write(0)`), so an absent bus costs nothing; unsigned macOS builds cannot show notification actions; autostart depends on the final app path (a moved `.app` breaks the login item: re-register at every start when enabled); a notarization/signing identity is an owner action (RULES.md section 2).

## 9. Ordered roadmap

1. Spikes S1, S4, S5 (foundation of the macOS path), S10 (ABI shape).
2. Contract: manifest `app` + `permissions` + capability keys + stub resolution; `system` plugin skeleton with the sim backend and the golden harness. Everything after is test-first against the simulator.
3. HAL window properties + close/drop hooks.
4. macOS bundle and dev bundle.
5. macOS features in order of value: notification, app/context/dock menu, tray, dialogs, window options and state, shortcuts, single instance + autostart, deep links and file open, power/appearance, clipboard rich.
6. Linux: D-Bus layer, notification, power; SNI tray; kit MenuBar and ContextMenu.
7. T2 desktop verification harness and docs.
8. Vibrancy/transparent frames and multiple windows (tied to the renderer roadmap).

## 10. Non-goals and later

Auto-update (Sparkle, MIT, for macOS bundles; its own report), App Store sandbox entitlements, touch bar, Windows (parked), a global DBusMenu menu bar on Linux, mobile notifications, push notifications (APNs/FCM), accessibility API exposure of Zinc UI, printing.

## 11. Proposed tasks

Size: S under half a day, M about one day, L several days. Dependencies name other proposed tasks (SYS-n); real ids are assigned when created. Every task ships its T0 test in the same commit (RULES.md section 7).

**SYS-01 Spikes S1, S4, S5, S10 on macOS (M, deps: none).**
- A decision-record section in `docs/reports/zinc-next-decisions.md` answers each spike with a measured yes/no and the chosen fallback.
- Evidence includes the delivered-notification readback, the screenshots of tray/dock/menu title of the dev bundle, and the signature check (`codesign -v`).
- Scratch code stays out of the tree except the final prototype of the 3-function ABI.

**SYS-02 Manifest contract: `app`, `permissions`, `scopes`, capability keys (M, deps: none).**
- zinc.json accepts `app{id,name,version,icon,dock,urlSchemes,fileTypes,window}`, `permissions` with `-` per-target removal and `scopes`; a bad id or an unknown permission is a diagnostic with the line.
- `targets/capabilities.json` has the section 5.2 keys; a build for esp32 of an app that imports `zinc:system/tray` succeeds and resolves to the stub; with `"requires": ["tray"]` it fails with the capability message.
- Importing a system module without its permission fails at compile time naming the permission id (golden diagnostic).

**SYS-03 `system` plugin skeleton, op table, recording simulator, scripted events (L, deps: SYS-01, SYS-02).**
- `plugins/system` loads with `zinc:system` and `supports()`; `ops.json` generates TS typings and the permission gate; `system_ops.sh` fails on drift.
- With `ZINC_DETERMINISTIC=1` a program calling one op prints the exact `[system] op {json}` line; `ZINC_SYSTEM_SCRIPT` delivers an event at the stated frame to a TS handler, interpreter and AOT identical.
- A host call without the compiled permission is refused natively (test through the C driver).

**SYS-04 HAL window creation by properties, close-request veto, drop forwarding (S, deps: SYS-02).**
- `hal_sdl.cpp` creates the window with properties from `app.window` (frameless, always-on-top, min size, position, transparent flag); defaults produce the same window as today (existing pixel goldens unchanged).
- `hal_close_requested()` weak hook lets a handler cancel the quit; dropped files reach `system.on('drop')`.
- Sim run logs the window creation request fields.

**SYS-05 macOS dev bundle and `zinc build --bundle` (M, deps: SYS-01, SYS-02).**
- `zinc run` of an app with `app.id` and a system import runs from `~/.zinc/cache/macos/devapp/<id>.app` with correct `CFBundleIdentifier` (check via `NSBundle` in selftest) and a valid ad-hoc signature.
- `zinc build --bundle` writes a launchable `.app` (Info.plist from the manifest, `.icns` from the PNG, URL types, `LSUIElement`), `codesign -v` passes; signing with an identity is a documented command, not run.
- Refreshing the dev bundle when nothing changed takes under 50 ms.

**SYS-06 Notifications on macOS with osascript fallback (M, deps: SYS-03, SYS-05).**
- Sim golden covers show with actions/reply/group/replace, permission states, cancel, `delivered()`, click/action/reply/close events from the script.
- On this Mac the bundled run delivers a notification (selftest readback shows id, title, body) and the `osascript` tier works unbundled with `backend: 'osascript'`.
- A denied permission resolves `delivered: false` with a reason, never throws.

**SYS-07 Menus: model, roles, accelerators, parser, native app menu, default menu (L, deps: SYS-03, SYS-04).**
- The accelerator parser and role table are shared TS code with 30+ unit cases (CmdOrCtrl, Plus, F-keys, invalid input).
- macOS selftest dump of `NSApp.mainMenu` equals the golden for the template of section 4.3; `performAction` on an item reaches `menu.onClick` once; edit roles produce `role:*` events and the hero example's text fields still copy/paste (S6).
- `menu.default()` applies when the app sets none, with the app name from the manifest.

**SYS-08 Context menu popup and dock menu/badge/bounce/progress on macOS (M, deps: SYS-07).**
- `menu.popup` resolves with the id from the script in the sim and from `performAction` in selftest; frames keep running or the stall is measured and recorded (S7).
- Dock badge readback equals the set string; dock menu items fire `menu` events with `source: 'dock'`.

**SYS-09 Tray on macOS (M, deps: SYS-03, SYS-05).**
- Create/update/destroy with template image, title, tooltip, menu, `menuOnLeftClick`; selftest shows `isTemplate == true`, the image size and the menu tree.
- Click, double-click, right-click events with bounds arrive from a real `performClick:` and from the script.
- `screencapture` of the status item region exists as a reference image; `LSUIElement` tray-only app starts without a dock icon.

**SYS-10 Dialogs: SDL_DIALOG on, open/save/message/confirm, fs scope (M, deps: SYS-03).**
- `SDL_DIALOG` switched on in CMake with the vendoring note updated; the engine still builds with clang and `zig c++`.
- Sim answers from `dialog-answer`; unanswered resolves cancel; picked paths enter the `user-picked` scope and a read outside it is refused (test).
- On macOS a hands-free check opens a dialog and dismisses it with `NSApp abortModal` in selftest; message dialog attaches as a sheet.

**SYS-11 Window module: state persistence, fullscreen, titlebar styles, traffic lights, opacity (M, deps: SYS-04, SYS-03).**
- State file round trip in a temp dir; clamping to displays tested with injected display rectangles (pure function, T0).
- Selftest reads `NSWindow` style mask and traffic-light button origins equal to the configured position after a resize and after fullscreen toggling.
- `onCloseRequested` + `hide` + tray click `show` loop works in sim and live.

**SYS-12 Global shortcuts on macOS (S, deps: SYS-03, SYS-07).**
- The shared accelerator parser feeds `RegisterEventHotKey`; `register` returns `ok`/`conflict`/`unsupported`; unregister frees the hotkey.
- Sim script fires the callback; live selftest posts the hotkey event and the callback runs once; no Accessibility prompt appears.

**SYS-13 Single instance and autostart (M, deps: SYS-03, SYS-05).**
- `instance.lock` with flock + libuv pipe: a second process delivers `{argv, cwd}` to the first and exits 0 (T1 test with two processes); a stale socket is recovered.
- `autostart` writes/removes the LaunchAgent or calls `SMAppService`, and the XDG `.desktop` on Linux; enable/disable/isEnabled covered with a temporary `HOME`.
- Sim logs the ops; the real macOS path is verified with `launchctl print`/file readback in a temp HOME.

**SYS-14 Deep links, file open, opener/reveal (M, deps: SYS-05, SYS-13).**
- A bundled app registered with `notes://` receives `open notes://x` (cold start through `getCurrent`, warm through `onOpen`); `application:openFiles:` arrives as `drop`/`open-file`.
- Linux writes the `.desktop` and `xdg-mime` entries (temporary XDG dirs) and forwards the argv URL through single-instance.
- `opener` refuses URLs outside the `scopes.opener.allow` list (test); `reveal` selects the file in Finder (selftest by `NSWorkspace` call log).

**SYS-15 Power, idle, appearance, sleep blocker, rich clipboard on macOS (M, deps: SYS-03).**
- `SDL_POWER` switched on; `power.battery()` returns SDL's values; suspend/resume/lock events come from `NSWorkspace` notifications posted in selftest and from the script.
- `preventSleep` creates and releases an IOKit assertion (checked with `pmset -g assertions`); dark/light event follows `SDL_EVENT_SYSTEM_THEME_CHANGED`.
- Clipboard image and file-list round trip through NSPasteboard in selftest; text path through the HAL is unchanged.

**SYS-16 Linux D-Bus layer, notifications, power, idle (L, deps: SYS-03).**
- `dbus.cpp` loads libdbus-1 by dlopen with our own prototypes, builds and runs on `zig c++` and gcc, and degrades to `backend: 'none'` when the library or the bus is missing.
- In the container with a mock Notifications server the `Notify` arguments equal the golden and `ActionInvoked` / `NotificationClosed` become TS events; `PrepareForSleep` becomes `suspend`/`resume`.
- No new link dependency: `ldd` of `zinc` is unchanged.

**SYS-17 Linux StatusNotifierItem tray with dbusmenu and Unity badge (L, deps: SYS-16, SYS-09).**
- With a mock watcher/host the item exposes `IconPixmap`, `ToolTip`, `Menu`; `GetLayout` equals the model; `Activate`, `SecondaryActivate`, `ContextMenu` become tray events; dbusmenu `Event` becomes a menu click.
- Without a watcher `tray.isAvailable()` is false and the app keeps running.
- Badge and progress emit the `com.canonical.Unity.LauncherEntry` signal with the app's `.desktop` URI.

**SYS-18 UI kit `MenuBar`, `ContextMenu`, accelerator handling for non-native menus (M, deps: SYS-07).**
- The same template renders in the kit when `menu.native` is false, with keyboard navigation, checkmarks, submenus and accelerators; a pixel golden for hero-style light and dark themes.
- Linux/Pi/sim run of the notes example opens File > New from its accelerator and from a scripted pointer click.
- When native, the components render nothing (no double menu).

**SYS-19 T2 desktop verification harness and docs (M, deps: SYS-06, SYS-07, SYS-09, SYS-11).**
- `ZINC_SYSTEM_SELFTEST` dumps the live state of every real macOS feature to JSON; `tests/t2/desktop.sh` runs a demo app, fires items with `performAction`, compares to goldens and takes `screencapture` references; skips cleanly without a GUI session.
- Optional System Events check runs only when `AXIsProcessTrusted`; `docs/desktop-integration.md` lists the commands and the per-platform fallback table.

**SYS-20 Transparent frames, vibrancy and multiple windows (L, deps: SYS-11, renderer roadmap ZN-170+).**
- Spike S2 and S8 recorded first; `transparent: true` shows desktop content through cleared areas on macOS and on a compositing Linux session (screenshot with a known wallpaper).
- `setVibrancy('sidebar')` produces a blurred backdrop (pixel-variance check on the screenshot); multiple windows only if the render roadmap exposes per-window scenes, otherwise this task splits and the second half is parked with the reason.
