# OS integration and OS widgets for Zinc apps (Electron/Tauri-style surface)

Date 2026-09-30. Read-only study of `/Users/mowmow/Lab/zinc` (dirty tree, nothing modified). Follows [README.md](README.md) and [studio-as-zinc-app.md](studio-as-zinc-app.md) (not redone; its gap list items 1, 6, 9, 12 are refined here).
Legend: **[V]** verified in repo/headers (file:line), **[W]** from a web source (linked in section 9), **[I]** my inference/estimate. Effort in person-weeks (pw), one engineer who knows the codebase, unvalidated. Cross-reference: a parallel study covers `.esp32.ts` twins and `Platform.has(cap)`; here features are gated by capability names such as `os.tray`.

---------------------------------------------------------------------------------------------------------------------

## 0. Verdict

1. **Most of the classic "desktop shell" checklist is already in the SDL3 that Zinc links; the work is plumbing, not research.** Installed SDL is 3.4.16 (`/opt/homebrew/include/SDL3/SDL_version.h`; it is a Homebrew system lib, **not vendored**) [V]. It has tray+menus, file/folder dialogs, message boxes, drop events, multi-mime clipboard, system theme + change event, power info, display enumeration, window opacity/transparent/utility/always-on-top/modal/parent/popup/hit-test/shape, taskbar progress and flash, `SDL_OpenURL`, `SDL_GetPrefPath` [V]. `hal_sdl.cpp` uses **none** of them: it uses ~45 SDL calls, only `SDL_SetClipboardText/GetClipboardText` (text) and `SDL_SetWindowAlwaysOnTop` (kiosk) from this list (`targets/macos/hal_sdl.cpp:117,434,442`) [V].
2. **What SDL3 does not have** (needs per-OS native code, ObjC++ on macOS first): native application menu bar (macOS `NSMenu` main menu), notifications, global shortcuts, deep links/URL schemes/file associations (this is *packaging + an event*), single-instance, autostart, dock badge/menu, keychain, biometrics, accent colour, updater, crash reporter, and every kind of OS widget.
3. **OS widgets cannot be written in Zinc.** WidgetKit needs a SwiftUI appex, Android needs a Glance/RemoteViews receiver, Windows needs a packaged WinRT/COM provider with Adaptive Cards, Plasma needs a QML plasmoid. What Zinc can honestly do is `zinc:widget`: an app declares a *data + layout descriptor* (a small JSON tree, close to Adaptive Cards), and `zinc export` generates per-OS thin native shells (Swift, Kotlin, C++/WinRT, QML) that render it and deep-link back into the app. The app process supplies data; it never draws the widget. [I from W]
4. **Naming clash:** `zinc:os` already exists (hostname/homedir/cpus/network, `lib/modules.d.ts:214-243`) [V]. Do not overload it; use a `zinc:desktop/*` family (or `zinc:shell`).
5. **Ranked first steps** (section 8): dialogs + drop + clipboard mime (SDL, ~2 pw) -> tray/menu-bar-only (SDL + one macOS hint, ~2 pw) -> theme/power/displays (~1 pw) -> notifications + single-instance + deep links (~4-5 pw) -> multi-window (4-6 pw, invasive). Widgets are last, and only as descriptor shells (macOS+Android first ~8-10 pw).

---------------------------------------------------------------------------------------------------------------------

## 1. What exists today in the repo (verified)

### 1.1 Host and HAL shape

| Item | Fact | Evidence |
|---|---|---|
| Hosts | `runtime/host.cpp` is 69 lines, `runtime/dev_host.cpp` 120 lines: thin shells around the program `.so`; the window lives in the HAL | `wc -l` [V] |
| HAL contract | One `hal_*` C ABI per target: `hal_init`, `hal_poll_input`, `hal_present`, `hal_run`, `hal_window_handle`, `hal_clipboard_get/set` (text only), `hal_set_cursor`, `hal_text_input` | `runtime/include/hal.h:63-74,98-131` [V] |
| Optional-hook pattern | Weak no-op defaults in the runtime for features a HAL may lack (`hal_clipboard_*`, `hal_set_cursor`, `hal_text_input`, `hal_escape*`, `hal_pixel_scale`) | `runtime/gfx.cpp:26,924-936` [V] |
| SDL3 HAL | One `static SDL_Window* win` + renderer, created once with `SDL_INIT_VIDEO` only; resizable, high-DPI; `SDL_AddEventWatch`; quit on `SDL_EVENT_QUIT` unless kiosk | `targets/macos/hal_sdl.cpp:76,110,120,288` [V] |
| Targets | `targets/{macos,common,esp32,null,ps1,ps2,wasm}`; `hal_sdl.cpp` serves macOS and Linux windows; no Windows | `ls targets`; `docs/reports/research-2026-09-30/studio-as-zinc-app.md:§1` [V] |
| Window handle escape hatch | `hal_window_handle()` returns the `SDL_Window*`; `webview.mm` turns it into an `NSWindow*` via `SDL_PROP_WINDOW_COCOA_WINDOW_POINTER` | `hal.h:124`, `targets/macos/hal_sdl.cpp:461`, `plugins/webview/src/webview.mm:109-111` [V] |
| Display plugins | `plugins/display-{fbdev,gl,remote,rmpp,scrollphat,ssd1306,st7789,ws2812}` drive frames through `hal_display`; `host_window` keeps the SDL window | `hal.h:134-145` [V] |

### 1.2 Plugins and modules

- Plugins today: `3d canvas2d device devtools display-* ffi gestures gphoto2 imu-qmi8658 ink lottie map mapping pixelfont process remarkable remote-view script socket sqlite svg three video wasm webview` [V].
- Shape (ADR 0010, `docs/plugins.md:12`): `plugin.json` (`kind: module`, `module: "zinc:x"`, `entry`, `targets`, `sources`, `pkg`, `frameworks`, `libs`, `defines`, `options`, `requires`, `packages`), `index.ts` (typed wrapper), and `native/<name>.spec.ts` (typed native interface, `requireNative<Spec>('Name')`), `native/<name>.<target>.cpp|.host.cpp`, `native/<name>.sim.ts` (headless twin) [V: `docs/plugins.md:30-51`, `plugins/webview/*`, `plugins/process/*`].
- Best precedent for this work: `plugins/webview` = spec (`webview.spec.ts`: handle-based, one `onEvent(cb)` callback), macOS-only ObjC++ (`src/webview.mm`, `"frameworks": ["WebKit","Cocoa"]`, `"pkg":["sdl3"]`, `plugin.json`), and a sim twin with no-op stubs (`native/webview.sim.ts`). A tray/dialog/notification plugin is the same skeleton [V].
- `zinc:process`: `posix_spawnp` + pipes; targets macos/linux/rpi1 only (`plugins/process/plugin.json`) [V]. Can shell out to `osascript`, `notify-send`, `open`, `xdg-open` as a stopgap [I].
- `zinc:webview`: macOS only; its `invoke` command allowlist model ("commands that are not registered reject", `plugins/webview/index.ts:5-6`) is the only existing capability-style gate [V].
- `zinc:script` (QuickJS-ng sandbox): "sees only what the host exposes" (`docs/plugins/script.md:136,282`) [V]. This is the seam for gating OS APIs from user scripts (section 6).
- `lib/std/kit/host.ts`: JSX helpers shared by Solid/React models. **Not an OS-integration layer** despite the name [V]. In-app kit `Dialog`, `Popover`, `DropdownMenu`, toast exist (studio report §1) [V].

### 1.3 Capabilities and packaging

- `targets/capabilities.json` lists hardware booleans per profile (`net, fs, audio, gpu, process, dynlib, pointer, keyboard...`); `requires` in `zinc.json`/`plugin.json` is checked at build time (Z5005), plugin availability via `targets` (Z5003) [V: `docs/plugins.md:39,46`, `targets/capabilities.json:3-12`]. No `os.*` capability exists yet; adding `os.tray` etc. fits the same table (values `true|false|"plugin"|"optional"`).
- No permission model in `zinc.json` (grep of `docs/plugins.md`, `docs/guide/08-security.md` for permissions: only plugin availability and the systemd hardening in `docs/reports/security-audit.md:30`) [V].
- Packaging: `macBundle()` writes `Info.plist` with only CFBundle keys + `NSHighResolutionCapable`, icon `.icns`, ad-hoc or Developer-ID `codesign --options runtime` (`compiler/src/tools.ts:297-322,197-198`); Linux gets a `.desktop` (`tools.ts:209`) and systemd unit. **No entitlements, no `LSUIElement`, no `CFBundleURLTypes`, no `CFBundleDocumentTypes`, no App Group, no MSIX/NSIS/AppImage/Flatpak/DMG** [V].
- OS integrations grep (notifications, tray, menus, dialogs, drop): none in `runtime/`, `targets/`, `plugins/`, `lib/std` [V].

### 1.4 SDL3 header inventory (3.4.16, `/opt/homebrew/include/SDL3`) [V]

| Need | SDL3 API | Notes |
|---|---|---|
| Tray + menus | `SDL_CreateTray(icon,tooltip)`, `SDL_SetTrayIcon/Tooltip`, `SDL_CreateTrayMenu`, `SDL_CreateTraySubmenu`, `SDL_InsertTrayEntryAt` (`SDL_tray.h:121-310`) | 24 functions; entries: label, checkbox, button, submenu, enabled/checked, callbacks [W wiki]. No badge, no rich content. |
| Open/save/folder dialog | `SDL_ShowOpenFileDialog`, `SDL_ShowSaveFileDialog`, `SDL_ShowOpenFolderDialog`, `SDL_ShowFileDialogWithProperties` (`SDL_dialog.h:166,326`) | Async callback, must be pumped by the event loop. Backends (NSOpenPanel / Win32 / xdg-portal or zenity) [I]. |
| Message box | `SDL_ShowMessageBox`, `SDL_ShowSimpleMessageBox` (`SDL_messagebox.h`) | Custom buttons and colour scheme; modal. No colour picker, no text-input prompt. |
| Drag-drop in | `SDL_EVENT_DROP_FILE/TEXT/BEGIN/COMPLETE/POSITION` (`SDL_events.h:232-236`) | Files and text only. No drag-out. |
| Clipboard | `SDL_SetClipboardData(callback,...)`, `SDL_GetClipboardData(mime)`, `SDL_HasClipboardData`, `SDL_GetClipboardMimeTypes`, `SDL_EVENT_CLIPBOARD_UPDATE` (`SDL_clipboard.h`, `SDL_events.h:229`) | Any mime, lazily provided. Rich text/HTML/image = mime plumbing only. |
| Theme | `SDL_GetSystemTheme()`, `SDL_EVENT_SYSTEM_THEME_CHANGED` (`SDL_events.h:119`) | light/dark only; **no accent colour**. |
| Power | `SDL_GetPowerInfo(&secs,&pct)` | Battery state polling; **no suspend/resume/lock/idle events** [I]. |
| Displays | `SDL_GetDisplays`, `SDL_GetDisplayContentScale`, `SDL_GetDisplayForWindow`, `SDL_GetWindowSafeArea`, `SDL_EVENT_DISPLAY_ADDED` | Bounds, scale, refresh, safe area (notch). |
| Windows | flags `ALWAYS_ON_TOP, UTILITY, TOOLTIP, TRANSPARENT, NOT_FOCUSABLE` (`SDL_video.h:213-222`), `SDL_SetWindowParent/Modal/Opacity/HitTest/Shape`, `SDL_CreatePopupWindow`, `SDL_ShowWindowSystemMenu`, `SDL_FlashWindow`, `SDL_SetWindowProgressState/Value` | Frameless = `SDL_WINDOW_BORDERLESS` + hit-test drag regions. **No vibrancy/blur/Mica** (native call needed). |
| Misc | `SDL_OpenURL` (`SDL_misc.h:72`), `SDL_GetPrefPath`, `SDL_HINT_MAC_BACKGROUND_APP` (`SDL_hints.h:2637`), `SDL_HINT_APP_ID` (`SDL_hints.h:184`) | `OpenURL` = "open"; **no reveal-in-file-manager**. Background-app hint = menu-bar-only mode on macOS. |
| Multi-window | Any number of `SDL_Window`s | The blocker is Zinc's singletons (one static `win`+renderer in the HAL, one `gfx`/`ui` surface), not SDL. |

Conclusion: `hal_sdl.cpp` can expose all of the above through weak `hal_desktop_*` hooks (pattern of `gfx.cpp:924-936`) with no new dependency [I]. Version to pin: 3.4.x (tray + progress + safe area exist; 3.2 would lack some) [V header presence, W for earlier versions].

---------------------------------------------------------------------------------------------------------------------

## 2. How other frameworks slice the API surface

### 2.1 Electron [W: electronjs.org docs]

- **Process split**: OS APIs live in the *main* process (`app`, `BrowserWindow`, `Tray`, `Menu`, `dialog`, `Notification`, `globalShortcut`, `powerMonitor`, `safeStorage`, `autoUpdater`, `screen`, `shell`, `nativeTheme`, `protocol`); renderers reach them through IPC or a preload `contextBridge`. Security = "expose named channels" (contextIsolation, sandbox on by default), not per-API permissions. [W]
- Entry points seen in docs: `Tray` ("icons and context menus in the system's notification area"), `app.requestSingleInstanceLock()` (second instance event), `app.setAsDefaultProtocolClient()`, `dialog.showOpenDialog/showMessageBox`, `Notification`, `powerMonitor` (suspend/resume/lock-screen/idle), `safeStorage` (Keychain/DPAPI/libsecret), `autoUpdater` (Squirrel.Mac/Windows; Linux external) [W].
- Not in Electron core: autostart (`app.setLoginItemSettings` yes, macOS/Windows only), widgets (none), Shortcuts/Intents (none), WidgetKit (none; needs a Swift appex bolted on by hand) [W/I].

### 2.2 Tauri 2 [W: v2.tauri.app/plugin, plugins-workspace]

- Core provides windows (`tao`), webview (`wry`), menus (`muda`), tray (`tray-icon`), all as Rust crates; **everything else is an official plugin**: notification, dialog, global-shortcut, deep-link, single-instance, autostart, updater, store, stronghold, os, positioner, window-state, opener (shell open/reveal), clipboard-manager, fs, http, log, process, upload, websocket, sql, biometric (mobile), barcode-scanner (mobile), nfc, haptics [W: search results list autostart, dialog, deep-link, global-shortcut, notification, positioner, single-instance, updater, window-state; remaining names from plugins-workspace listing, [I] partially unverified].
- **Permission model**: each plugin ships a `permissions/` set (`allow-*`, `deny-*` per command, plus scopes such as fs paths), grouped in *capabilities* JSON files that bind permissions to windows/webviews; the runtime rejects unlisted IPC commands [W]. This is the closest analogue for Zinc `zinc.json`.
- Mobile plugins are Kotlin/Swift with a Rust bridge (same plugin, per-OS native code) [W].

### 2.3 Others (all [W] unless noted)

| Framework | OS-integration shape |
|---|---|
| Wails | Go runtime API (`runtime.MenuSetApplicationMenu`, `runtime.OpenFileDialog`, `EventsEmit`); tray only in v3 alpha |
| Neutralino | `Neutralino.os.*` (showOpenDialog, showNotification, setTray), gated by a static `nativeAllowList` in `neutralino.config.json` |
| Flutter | packages, not core: `tray_manager`, `window_manager`, `flutter_local_notifications`, `local_auth`, `flutter_secure_storage`, `home_widget` (widgets = native extension + shared storage) |
| Qt | `QSystemTrayIcon`, `QMenu/QMenuBar` (native macOS menu bar), `QFileDialog`, `QSharedMemory/QLockFile` |
| Slint | minimal: menus (MenuBar element), no tray in core; uses winit |
| Dioxus desktop | tao/wry like Tauri: `use_muda_event_handler`, tray via `tray-icon` |
| Compose Multiplatform Desktop | composables `Tray()`, `MenuBar`, `Window`, `Dialog`; notifications via `TrayState.sendNotification` [W: kotlinlang.org compose-desktop-tray] |
| .NET MAUI | no cross-platform widget API: each platform needs its own native extension (WidgetKit / Glance) and shared storage [W: mobiletechlead.com] |
| Avalonia | `TrayIcon`, `NativeMenu` (native macOS menu bar), `StorageProvider` (dialogs), `Screens`, `PlatformSettings` (theme + accent) [W/I] |

**Pattern across all of them**: (a) a small always-available core (window, menu, tray, dialog) plus (b) opt-in modules per concern, each with a permission/allowlist entry, (c) native code per OS behind one typed API, (d) nothing crosses into OS widgets without a hand-written per-OS extension.

### 2.4 Underlying native libraries and APIs [W unless noted]

| Concern | macOS | Windows | Linux |
|---|---|---|---|
| Tray | `NSStatusItem` (+ `NSMenu`, `LSUIElement`) | `Shell_NotifyIconW` (+ hidden message window) | StatusNotifierItem over D-Bus (libappindicator / libayatana; GNOME needs the AppIndicator extension; Flatpak needs SNI permission) |
| Menu | `NSMenu` main menu + contextual `NSMenu` (`muda` wraps it) | `HMENU` / `TrackPopupMenu` | GTK menus / dbusmenu; no global menu bar convention |
| Notifications | `UNUserNotificationCenter` (needs signed bundle id; auth prompt) | `AppNotification`/toast via WinRT (needs AUMID; unpackaged apps need a Start-menu shortcut with AUMID) | `org.freedesktop.Notifications` (libnotify, `notify-rust`) or portal `org.freedesktop.portal.Notification` |
| File dialogs | `NSOpenPanel/NSSavePanel` | `IFileDialog` | portal `org.freedesktop.portal.FileChooser` (Flatpak-safe), else GTK/zenity |
| Theme | `NSApp.effectiveAppearance`, `NSColor.controlAccentColor` | `UISettings` (accent, colour values) | portal Settings `org.freedesktop.appearance` `color-scheme` / `accent-color` [W: flatpak portal docs] |
| Global shortcut | Carbon `RegisterEventHotKey` (no permission) / CGEventTap (Accessibility permission) | `RegisterHotKey` | X11 `XGrabKey`; Wayland: portal `GlobalShortcuts` (compositor-dependent) |
| Deep link | `CFBundleURLTypes` + `application:openURLs:` (Apple Event) | registry / MSIX `windows.protocol` | `.desktop` `MimeType=x-scheme-handler/...` |
| Keychain | Security.framework (`SecItem*`) | DPAPI / Credential Manager | libsecret (Secret Service D-Bus) or portal Secret |
| Biometric | `LocalAuthentication` (`LAContext`), Touch ID | Windows Hello (`UserConsentVerifier`) | none standard (fprintd/polkit) |
| Login item | `SMAppService` (13+) | `HKCU\...\Run` or MSIX `startupTask` | `~/.config/autostart/*.desktop` or portal Background `RequestBackground` |
| Idle/power | `IOPMAssertion`, `NSWorkspace` notifications | `WM_POWERBROADCAST`, `WTSRegisterSessionNotification` | logind D-Bus (`PrepareForSleep`, `Lock/Unlock`), `org.freedesktop.ScreenSaver` |
| Reveal in file manager | `NSWorkspace activateFileViewerSelectingURLs` | `SHOpenFolderAndSelectItems` | `org.freedesktop.FileManager1.ShowItems` D-Bus |
| Vibrancy/blur | `NSVisualEffectView` | Mica/Acrylic via `DwmSetWindowAttribute` | compositor-specific (KDE blur protocol), mostly none |
| Screenshots | `CGWindowListCreateImage` / ScreenCaptureKit (Screen Recording permission) | `BitBlt` / `Windows.Graphics.Capture` | portal `Screenshot` / `ScreenCast` (Wayland: user consent required) |

---------------------------------------------------------------------------------------------------------------------

## 3. OS widgets: what is technically required

| Platform | Mechanism | Technical requirements | Can a non-native app supply it? |
|---|---|---|---|
| **macOS WidgetKit** (desktop widgets, macOS 14+ also iPhone widgets on desktop) | A **Widget Extension appex** (separate process, own `Info.plist`) inside the `.app`, SwiftUI-only UI with a `TimelineProvider` returning `Timeline` entries + reload policy | Xcode-style target; App Groups capability (`group.*`) for shared data (`UserDefaults(suiteName:)` or shared files); signed with the same team; refresh budgeted by the system. [W: Apple docs, useyourloaf] | The **data** yes (write JSON into the app-group container from any language). The **view and provider** must be Swift/SwiftUI compiled into the appex. The requirement for SwiftUI applies to the widget view only; the host app can be UIKit/anything [W]. Interactive widgets use App Intents (Swift). |
| **iOS/iPadOS** | Same appex; also lock-screen widgets, **Live Activities** (ActivityKit, push-token updates), Control widgets (iOS 18), App Intents/Shortcuts | Same + entitlements; Live Activities need push notifications infra for remote updates | Same answer: data via app group, UI in Swift. Zinc has no iOS HAL yet (`docs/reports/ios-core-runtime.md` proposes one) [V]. |
| **Windows 11 Widgets Board** | Provider = packaged Win32/WinRT app implementing `IWidgetProvider` (CreateWidget, DeleteWidget, OnActionInvoked, OnWidgetContextChanged, Activate, Deactivate); UI = **Adaptive Cards JSON template + data JSON** returned by the provider | **MSIX/APPX manifest** registration with COM server, out-of-proc activation; local dev needs Developer Mode; provider can be C++/WinRT, C#, or a PWA [W: Microsoft Learn widget-providers] | Yes, the most friendly: provider is a normal packaged exe, UI is declarative JSON. A Zinc app could *be* the provider if it can be MSIX-packaged and expose the COM factory. Blocked by no Windows target. |
| **Android App Widgets** | `AppWidgetProvider` (BroadcastReceiver) + `appwidget-provider` XML + `RemoteViews` (a fixed set of view classes); Jetpack Glance is a Compose-style DSL that *compiles to RemoteViews* [W: developer.android.com Glance] | Kotlin/Java receiver declared in the APK manifest; updates via `AppWidgetManager` or WorkManager | UI = RemoteViews limits (no custom drawing, except a `Bitmap` into an `ImageView`). A Zinc NativeActivity app could render a **bitmap** widget (image + tap intents) with a tiny generated Kotlin receiver. |
| **Linux/KDE Plasma** | **Plasmoid**: a KPackage with `metadata.json` (`KPackageStructure: Plasma/Applet`) + QML (`main.qml`), optional C++ plugin [W: develop.kde.org] | Install to `~/.local/share/plasma/plasmoids/<id>/`; Plasma 6 API | Pure QML shell reading a JSON/socket from the app (files, D-Bus, local socket). No Zinc code runs inside. |
| **GNOME** | Panel applets were removed in GNOME 3; only **Shell extensions** (GJS, per-Shell-version, reviewed at extensions.gnome.org) [W]. GNOME 44+ shows "Background Apps" via the portal (status only) [W] | JS extension tied to shell version | Data via D-Bus/file; extension is JS. High maintenance churn: skip. |
| **Linux tray** | StatusNotifierItem D-Bus (AppIndicator on GNOME via extension) | see 2.4 | Zinc can implement (SDL tray on Linux already targets it, [I]). |
| **Desktop/wallpaper widgets** | macOS: WidgetKit desktop widgets; Windows: none (Rainmeter is third-party); Linux: Conky/Plasma; wallpaper engines = own windows | Zinc can do a **borderless, transparent, below/utility window** via SDL flags (`SDL_WINDOW_TRANSPARENT`, `UTILITY`, click-through via hit-test) with no OS help [V flags, I] | Yes, because it is an ordinary Zinc window. |
| **reMarkable / e-ink** | xochitl has no widget/third-party home-screen API; Zinc apps run via AppLoad (`docs/targets/remarkable-paper-pro.md`) [V that AppLoad is referenced]. Only "widget" = an app/full-screen sleep screen or a `zinc:remote` companion [I] | none | n/a. A "widget" on e-ink is a small always-running app tile drawn by the launcher, if AppLoad supports it (unverified). |
| **Menu-bar-only apps** | macOS `LSUIElement=true` in `Info.plist` (no Dock icon, no main menu), or runtime `NSApp.setActivationPolicy(.accessory)`; SDL exposes `SDL_HINT_MAC_BACKGROUND_APP` [V header] | window optional; tray required | Yes, fully within Zinc: SDL tray + hint + optional popover window. |

### 3.1 What a cross-platform `zinc:widget` honestly is [I]

A **descriptor**, not a renderer:

```
Widget = { id, sizes:[small|medium|large|...], refresh:{ every:'15m'|'push' }, template: Card, data: JSON, actions:[{id, deepLink}] }
Card   = tree of: Text, Image(bitmap|symbol), Row, Column, ProgressBar, Chart(sparkline), Button(actionId), Spacer
```

- The app (or a headless "widget mode" of the same binary, launched by the OS shell) produces `{template, data}`; the descriptor subset is the *intersection* of Adaptive Cards, SwiftUI stacks, Glance, QML Row/Column.
- `zinc export` generates: a **SwiftUI appex** (interpreting the JSON with a small generic renderer; Zinc ships that Swift once, not per app), an **Android Glance/RemoteViews receiver** (same), a **Windows provider** (`IWidgetProvider` returning Adaptive Card JSON, nearly 1:1), a **Plasma QML applet** (generic renderer). Data travels through app-group container / `SharedPreferences` / provider push / local file/socket.
- Taps become **deep links** (`myapp://widget/<action>`), handled by `zinc:deeplink`, so widgets depend on that module.
- Cannot be done: arbitrary Zinc drawing inside a widget, per-frame animation, running Zinc TS inside the appex (iOS widget process is memory-capped and JIT-less; the Zinc VM is JIT-free so feasible in principle but out of scope [I]), interactive widgets beyond button->deeplink/intent, Live Activities without a push server, GNOME.
- Cheaper interim for "glanceable" needs: render the widget to a **bitmap** (Zinc already has a software rasterizer) and let a fixed native shell show `Image + tap` per OS. This is `zinc:widget` v0, needs no schema and works on Android RemoteViews, WidgetKit (`Image`), Plasma (`Image`) [I].

---------------------------------------------------------------------------------------------------------------------

## 4. Design: module surface

### 4.1 Principle

- One module per concern (small, individually gated, each with `.sim.ts`), namespaced `zinc:desktop/*` (not `zinc:os`, taken).
- Async results delivered on the event loop (same as `zinc:webview` `onEvent`, SDL dialog callbacks). No blocking modal calls.
- Handle-based specs (integers), typed wrapper in `index.ts`, like `webview.spec.ts` / `webview/index.ts`.
- Each module registers a capability name (`os.tray`, ...) in `targets/capabilities.json` and a permission id (`desktop.tray`) in `zinc.json`.

### 4.2 Modules

| Module | Capability | Content |
|---|---|---|
| `zinc:desktop/dialog` | `os.dialog` | open/save/folder dialogs, message box, (color, prompt as kit fallbacks) |
| `zinc:desktop/tray` | `os.tray` | tray icon, tooltip, menu, click events, `menuBarOnly` |
| `zinc:desktop/menu` | `os.menu` | application menu (macOS native; others in-app kit `MenuBar`), context menus |
| `zinc:desktop/notify` | `os.notify` | notifications with actions and reply |
| `zinc:desktop/window` | `os.window` | multi-window, frameless, always-on-top, transparent, vibrancy, progress, badge, flash, displays |
| `zinc:desktop/shortcut` | `os.shortcut` | global hotkeys |
| `zinc:desktop/app` | `os.app` | single instance, deep links, file associations (open-file events), autostart, dock badge/menu, quit/relaunch, updater hooks |
| `zinc:desktop/system` | `os.system` | theme+accent, power/idle/lock events, displays, open/reveal, clipboard rich (`zinc:gfx` clipboard extended) |
| `zinc:desktop/secret` | `os.secret` | keychain/credential store, biometric gate |
| `zinc:widget` | `os.widget` | widget descriptors (section 3.1) |
| `zinc:desktop/intent` | `os.intent` | Shortcuts/App Intents/App Actions registration (descriptor, later) |

### 4.3 Typed sketches (illustrative, [I])

```ts
// zinc:desktop/dialog  (SDL_ShowOpenFileDialog & friends; sim: scripted answers)
export interface FileFilter { name: string; patterns: string[] }        // ['png','jpg']
export interface OpenOptions { title?: string; defaultPath?: string; filters?: FileFilter[]; multiple?: boolean; folder?: boolean }
/** Resolves to the chosen paths, or [] when cancelled. Delivered on the event loop. */
export function open(o: OpenOptions, done: (paths: string[]) => void): void;
export function save(o: { title?: string; defaultPath?: string; filters?: FileFilter[] }, done: (path: string | null) => void): void;
export interface MessageOptions { title: string; message: string; kind: 'info' | 'warning' | 'error'; buttons: string[]; defaultButton?: i32 }
export function message(o: MessageOptions, done: (button: i32) => void): void;

// zinc:desktop/tray
export interface MenuItem { id: string; label: string; kind?: 'normal' | 'check' | 'separator' | 'submenu'; checked?: boolean; enabled?: boolean; accelerator?: string; items?: MenuItem[] }
export class Tray {
  constructor(o: { icon: string; tooltip?: string; template?: boolean /* macOS monochrome */ });
  setMenu(items: MenuItem[]): void;
  setIcon(icon: string): void; setTooltip(t: string): void; setTitle(t: string): void; // title = macOS menu-bar text
  onClick(cb: (button: 'left' | 'right') => void): void;
  onMenu(cb: (id: string) => void): void;
  close(): void;
}
export function menuBarOnly(on: boolean): void;    // LSUIElement/accessory policy, no dock icon

// zinc:desktop/notify
export interface Notification { title: string; body?: string; icon?: string; actions?: { id: string; label: string }[]; silent?: boolean; id?: string }
export function requestPermission(cb: (granted: boolean) => void): void;
export function show(n: Notification): void;
export function onAction(cb: (notifId: string, action: string) => void): void;

// zinc:desktop/window
export interface WindowOptions { title: string; w: number; h: number; x?: number; y?: number; frameless?: boolean; alwaysOnTop?: boolean;
  transparent?: boolean; vibrancy?: 'none' | 'sidebar' | 'menu' | 'popover' | 'hud'; modalOf?: Window; utility?: boolean; resizable?: boolean; clickThrough?: boolean }
export class Window { readonly id: i32; setProgress(v: number | null): void; setBadge(text: string | null): void; flash(): void; close(): void; onClose(cb: () => void): void; }
export interface Display { id: i32; x: i32; y: i32; w: i32; h: i32; scale: number; refreshHz: number; primary: boolean }
export function displays(): Display[];

// zinc:desktop/app
export function singleInstance(onSecond: (argv: string[], cwd: string) => void): boolean;  // false: another instance owns the lock
export function onOpenUrl(cb: (url: string) => void): void;                                // deep link
export function onOpenFile(cb: (path: string) => void): void;                              // file association / dock drop
export function setAutostart(on: boolean): boolean;

// zinc:desktop/system
export function theme(): { dark: boolean; accent: string | null };
export function onThemeChange(cb: () => void): void;
export function onPower(cb: (e: 'suspend' | 'resume' | 'lock' | 'unlock' | 'idle' | 'active') => void): void;
export function battery(): { percent: i32; seconds: i32; charging: boolean } | null;
export function openExternal(url: string): void;             // SDL_OpenURL
export function reveal(path: string): void;                  // NSWorkspace / SHOpenFolderAndSelectItems / FileManager1
```

Kit layer: `MenuBar`, `ContextMenu`, `FilePicker` in `lib/std/kit` fall back to the in-app implementation when `Platform.has('os.dialog')` is false (wasm, rpi1 without desktop, rmpp).

---------------------------------------------------------------------------------------------------------------------

## 5. Mapping to SDL3 vs per-OS native, inside plugin/HAL

Two layers, matching existing patterns:

1. **HAL hooks** (for things SDL owns and that touch the window/event loop): add weak `hal_desktop_*` functions in `runtime/include/hal.h` with weak defaults in the runtime (`runtime/gfx.cpp:924-936` pattern) and implement in `targets/macos/hal_sdl.cpp`. Covers: drop events (`SDL_EVENT_DROP_*` in the event pump at `hal_sdl.cpp:288` neighbourhood), theme change, clipboard mime, `SDL_OpenURL`, displays, power, window flags. **Multi-window is the exception**: `hal_sdl.cpp` has a single `win`/`ren` (line 110) and gfx/ui are singletons; needs a window table + per-window surface [V single, I plan]. Effort 4-6 pw (matches studio report gap 6).
2. **Plugins** (for native code with dependencies): `plugins/desktop-*/` with `plugin.json` per target, `native/*.spec.ts`, `native/*.macos.cpp|.mm`, `native/*.linux.cpp`, `native/*.win32.cpp`, `native/*.sim.ts`. Windows entries are speculative until a Windows host exists (prior research: none; studio report gap 7).

| Feature | SDL3 (HAL) | Native per OS (plugin) | sim twin |
|---|---|---|---|
| Dialogs | yes, all OS | none needed (color picker: NSColorPanel later) | scripted queue: `sim.dialog.answer([...])` |
| Tray | yes (macOS/Win/Linux SNI) | `NSStatusItem` for template icons, title text, popover; Linux fallback via D-Bus SNI if SDL's backend is weak [I] | records menu; `sim.tray.click(id)` |
| App menu bar | no | macOS ObjC++ `NSMenu` (precedent `webview.mm`); Windows/Linux: in-app kit `MenuBar` | records menu tree |
| Notifications | no | macOS `UNUserNotificationCenter` (needs bundle id, so only from `.app`), Windows `AppNotification`, Linux D-Bus/portal | log array |
| Global shortcuts | no | macOS Carbon hotkeys (no permission), Windows `RegisterHotKey`, Linux X11/portal | `sim.shortcut.fire(...)` |
| Deep link/file open | events partly (`SDL_EVENT_DROP_FILE` for dock open on macOS [I]) | Info.plist keys, `application:openURLs:`, MSIX protocol, `.desktop` MIME | `sim.app.openUrl(...)` |
| Single instance | no | `flock`/named pipe/`CreateMutex` + argv forward via local socket (Zinc has `zinc:socket` Unix domain) | always true |
| Autostart | no | `SMAppService`, registry, `.desktop` | in-memory flag |
| Badge/progress | `SDL_SetWindowProgress*`, `SDL_FlashWindow` | `NSDockTile.badgeLabel`, `ITaskbarList3` overlay | recorded |
| Vibrancy | no | `NSVisualEffectView` / DWM | no-op |
| Keychain | no | Security.framework / DPAPI / libsecret | in-memory map |
| Theme/accent | theme yes | accent: `NSColor.controlAccentColor`, `UISettings`, portal | scripted |
| Power/idle | `SDL_GetPowerInfo` only | `NSWorkspace` notifications, logind, `WM_POWERBROADCAST` | scripted events |
| Widgets | no | per-OS generated shells (section 3.1) | descriptor validator + snapshot render to PNG |
| Updater | no | see section 7.4 | manifest check only |

Testing: same as other plugins: `.sim.ts` run under the node sim (`docs/plugins.md:45` nodeFlags mechanism) so `zinc test` exercises the app logic headlessly; native paths get a small "desktop-smoke" example run under the real host by hand or with the existing replay tapes (studio report cites goldens/replay).

---------------------------------------------------------------------------------------------------------------------

## 6. Capability gating and the security model

Three independent gates, from cheapest to strictest [I, modelled on Tauri capabilities and Neutralino nativeAllowList, W]:

1. **Build-time availability** (exists): `plugin.json` `targets` (Z5003) and `requires` (Z5005) against `targets/capabilities.json`. Add capability names `os.tray`, `os.menu`, `os.dialog`, `os.notify`, `os.window`, `os.shortcut`, `os.app`, `os.system`, `os.secret`, `os.widget`. Values: `true` on macos/linux desktop, `"optional"` where the feature depends on the environment (Linux tray needs SNI, notification needs a daemon, global shortcuts on Wayland), `false` on rpi1/rmpp/esp32/ps*/wasm (wasm may later get `os.dialog`, `os.notify`, `os.system` via browser APIs). Programs write `if (Platform.has('os.tray'))` (parallel study) or declare `requires: ["os.tray"]`.
2. **App permission manifest** in `zinc.json`: `"desktop": { "permissions": ["tray","notify","dialog:open","secret","autostart"] }`. The compiler rejects imports of a `zinc:desktop/*` module not listed (mirrors Tauri "capabilities"), and *derives* the platform metadata from it (below). Least privilege is visible in review, and `zinc export` emits only the needed entitlements/manifest entries. Reasons for a compile-time list rather than runtime prompts: it is auditable and it is exactly what sandbox formats need anyway.
3. **Sandbox/store entitlements** derived from the permission list (section 7): macOS App Sandbox entitlements (`com.apple.security.app-sandbox`, `files.user-selected.read-write` for dialogs, `network.client`, `keychain-access-groups`, `application-groups`), MSIX capabilities (`runFullTrust`, `startupTask`), Flatpak `finish-args` (`--talk-name=org.freedesktop.Notifications`, `--talk-name=org.kde.StatusNotifierWatcher`, `--share=network`), iOS entitlements/`Info.plist` usage strings (`NSFaceIDUsageDescription`, ...). [W: flatpak docs desktop integration, Apple docs; I for the mapping]

**Relation to `zinc:script`** (`docs/plugins/script.md:136,282`): scripts see nothing but host-exposed functions. Rule: **OS APIs are never auto-exposed to a `Script`**. The host app must wrap a specific call (e.g. `notify.show` with a rate limit and title prefix) and register it; user scripts and mods then run with the app's *narrower* set. Same for `zinc:webview`: `invoke` commands already reject unless registered (`plugins/webview/index.ts:5-6`); a page must not reach `desktop/secret` unless the app registers a handler [V/I].

Specific hazards: shell-open must validate scheme (`https`, `mailto`; no `file:`/custom by default); reveal/dialog return paths that then feed `zinc:fs` (no scope enforcement in `zinc:fs` today, [I]); global shortcuts and screenshots are privacy-sensitive (macOS Accessibility/Screen Recording TCC prompts); keychain items should be namespaced by bundle id.

---------------------------------------------------------------------------------------------------------------------

## 7. Build and packaging story

Extend `compiler/src/tools.ts` (`macBundle`, `tools.ts:297-322`), keyed off the `zinc.json` `desktop` block:

### 7.1 macOS
- `Info.plist` additions from config: `LSUIElement` (menu-bar-only), `CFBundleURLTypes` (deep links), `CFBundleDocumentTypes` + `UTExportedTypeDeclarations` (file associations), `NSUserNotificationAlertStyle`, `NSFaceIDUsageDescription`, `LSApplicationCategoryType`, `NSSupportsAutomaticTermination`, background modes; `NSHumanReadableCopyright`. [W/I]
- Entitlements plist passed to `codesign --entitlements` (today codesign has no entitlements: `tools.ts:197`) [V]; hardened runtime is already used with a Developer ID. Notarization stays manual (`xcrun notarytool`); add `zinc export --notarize` [I]. Notifications and `SMAppService` need a real bundle id and signature; the dev `zinc run` already runs inside a bundle (`macBundle` "so the Dock shows the app's name") [V], which makes notifications testable in dev.
- Widgets: add an **appex** to `Contents/PlugIns/`, signed with the app-group entitlement; needs Xcode command-line tools and a real signing identity (ad-hoc appex + app group does not work for shared containers [W/I]).
- DMG (`hdiutil`), Sparkle-style updater (7.4).

### 7.2 Windows (blocked: no Windows host)
- MSIX (needed for `IWidgetProvider`, `startupTask`, notification identity, protocol handlers) plus NSIS/WiX for unpackaged. Code signing with Azure Trusted Signing/EV cert. Cost only after the Windows host exists (4-6 pw for sim+toolchain per prior research, studio report gap 7 [V]).

### 7.3 Linux
- AppImage (needs desktop file + icon + `MimeType=x-scheme-handler/...`), `.deb`, **Flatpak** manifest generated from permission list (`finish-args`), portals used for dialogs/notifications/settings (SDL dialogs already prefer the portal [I]). Tray under Flatpak needs the `org.kde.StatusNotifierWatcher` talk permission. Existing `.desktop` + systemd export (`tools.ts:209`, `security-audit.md:30`) is the kiosk/device flavour and stays.

### 7.4 Auto-update, crash reporting
- **Updater**: keep out of the runtime. `zinc:desktop/app` exposes `checkForUpdate(manifestUrl)` (uses `zinc:net`, sha256 exists per studio report) + `installAndRelaunch(path)`; apply step is per OS: macOS Sparkle (external framework, EdDSA signed appcast) or replace `.app` in place; Windows MSIX/App Installer; Linux AppImageUpdate or package manager. Zinc already has OTA plans for iOS/VM bytecode (README item 1); **bytecode-only updates are the Zinc-specific fast path** (ship `.zbc` to a pre-built core) [V/I].
- **Crash reporting**: `SIGSEGV`/`SIGABRT` handler + `hal_panic` (`hal.h:114`) can write a minidump-like file (backtrace + Zinc call stack from the VM) to `SDL_GetPrefPath`; uploading via `zinc:net` next launch. Crashpad/Breakpad only if symbolicated native minidumps are needed [I]. 2 pw.

---------------------------------------------------------------------------------------------------------------------

## 8. Ranked list, effort and dependencies

Effort is for macOS+Linux via SDL/POSIX unless noted; add 30-60% for a Windows implementation once a Windows host exists (not before: no host).

| # | Item | pw | Depends on | Notes |
|---|---|---|---|---|
| 1 | `dialog` (open/save/folder/message) + **file drop** + **clipboard mime** + `openExternal` + `theme/onThemeChange` + `battery` + `displays` | 2.0 | SDL 3.4 (present); weak `hal_desktop_*` + `os.*` capability names + sim twins | Highest value/effort; unblocks Studio v0 (studio report gap 1). |
| 2 | `tray` + `menuBarOnly` (`SDL_HINT_MAC_BACKGROUND_APP` and `LSUIElement`) | 1.5-2 | 1 | Menu-bar apps: clock/monitor/utility class of apps become possible. Linux SNI availability: test GNOME/KDE. |
| 3 | `zinc.json` `desktop.permissions` + compiler gating + Info.plist/entitlements/.desktop generation | 1.5-2 | 1,2 | Do early, so each later module lands gated. |
| 4 | `notify` (macOS UN + Linux D-Bus) | 1.5 | 3; signed bundle in dev | Windows later. Actions/reply callbacks need event-loop wiring. |
| 5 | `app`: single-instance (Unix socket), deep links (Info.plist + Apple Events; `.desktop` MIME), file open events, autostart (`SMAppService`, `.desktop`) | 2.5 | 3 | Needs ObjC++ app delegate hook; SDL emits dropfile for macOS open-file [I]. |
| 6 | native macOS **app menu bar** (`NSMenu`) + context menus (in-app kit `ContextMenu`, native optional) | 2 (+0.5 kit) | 3 | Kit `MenuBar` fallback first (0.5). |
| 7 | `window`: frameless/transparent/always-on-top/vibrancy/progress/badge for the **single** window | 1.5 | 1 | SDL flags + `NSVisualEffectView` via `hal_window_handle` (precedent `webview.mm:109`). |
| 8 | `secret` (Keychain, libsecret) + biometric (LocalAuthentication) | 2 | 3 | Simple ObjC++/libsecret; biometric mac only. |
| 9 | `shortcut` (Carbon hotkeys, X11; Wayland portal optional) | 1.5 | 3 | Wayland unreliable: `"optional"`. |
| 10 | **Multi-window** | 4-6 | 7; HAL window table, per-window gfx/ui context | Invasive; required for tear-off, prefs windows; can defer by using in-app panes/`utility` popup windows. |
| 11 | Updater + crash reporter + DMG/AppImage/Flatpak export | 4-5 | 3 | Parallelisable. |
| 12 | `widget` v0: bitmap widget + tap deeplink; macOS appex generator + Android receiver | 4-5 | 5 (deeplinks), app-group entitlement, Apple signing; Android/iOS HAL (iOS core study) | v1 descriptor renderers (SwiftUI/Glance/QML) +4-6; Windows provider +3-4 after Windows host. |
| 13 | Shortcuts/App Intents/App Actions, Spotlight/Quick Look, share extensions | 3-4 each | 12 infra (appex generator) | Same appex generator; iOS/macOS only. Descriptor `intent` list. |
| 14 | Windows implementations of 1-9 | 6-8 | Windows host (absent) | Blocked. |
| 15 | Accessibility bridge | 10-16 | own study | Not in scope here, but blocks credible desktop apps (studio report gap 8). |

Total realistic first tranche (items 1-9): **~14-17 pw**, yields most of what Electron/Tauri apps use daily on macOS/Linux.

### 8.1 Coverage table (Electron / Tauri 2 / Zinc today / Zinc after tranche 1-9)

| Feature | Electron | Tauri 2 | Zinc today | Zinc proposed |
|---|---|---|---|---|
| Tray / menu-bar icon | Tray | tray-icon | no | yes (SDL + mac hint) |
| Menu-bar-only app | dock.hide | ActivationPolicy | no | yes |
| Native app menu | Menu | muda | no | mac native, else in-app |
| Context menu | Menu.popup | muda | kit DropdownMenu (in-app) | in-app + optional native |
| Open/save dialog | dialog | plugin-dialog | no | yes (SDL) |
| Message box | dialog | plugin-dialog | no | yes (SDL) |
| Color/font picker | no (web) | no | no | skip (kit) |
| Notifications | Notification | plugin-notification | no | yes |
| Global shortcut | globalShortcut | plugin-global-shortcut | no | yes (mac/x11) |
| Multi-window | BrowserWindow | WebviewWindow | no | yes (item 10) |
| Frameless/transparent/always-on-top | yes | yes | kiosk on-top only | yes |
| Vibrancy/Mica | yes | window-vibrancy crate | no | mac, later Win |
| Drag-drop files in | yes | yes | no | yes |
| Drag-out / rich drag | yes (startDrag) | partial | no | skip |
| Clipboard rich | clipboard | plugin-clipboard-manager | text only (`hal.h:66`) | mime (SDL) |
| Deep links / file assoc | protocol / open-file | plugin-deep-link | no | yes |
| Single instance | requestSingleInstanceLock | plugin-single-instance | no | yes |
| Autostart | setLoginItemSettings | plugin-autostart | no | yes |
| Dock badge/progress | app.dock / setProgressBar | window API | no | yes |
| Jump lists | app.setJumpList (Win) | no | no | skip (until Windows) |
| Power/idle | powerMonitor | no official (community) | no | partial (battery, suspend where cheap) |
| Displays | screen | monitor API | `SDL_GetPrimaryDisplay` internal | yes |
| Screenshots | desktopCapturer | no official | no | skip (or macOS only via `screencapture` spawn) |
| Open/reveal | shell | plugin-opener | no (`zinc:process` + `open`) | yes |
| Keychain | safeStorage | plugin-stronghold / community keyring | no | yes |
| Biometric | no | plugin-biometric (mobile) | no | mac only |
| Theme/accent | nativeTheme | window theme | no | theme yes, accent mac/win |
| Accessibility | Chromium | webview | none | separate study |
| Auto-update | autoUpdater | plugin-updater | no | yes (`zinc:net` + per-OS apply) |
| Crash reporting | crashReporter | community | no | basic |
| OS widgets | none (hand-made native ext.) | none | none | descriptor shells |
| Shortcuts/Intents | none | none | none | later, via appex generator |
| Binary size | 100-200 MB | 5-15 MB + engine | ~1-5 MB | same |

---------------------------------------------------------------------------------------------------------------------

## 9. What to skip, and the honest limits

- **Skip**: GNOME Shell extension shells (per-version breakage), Windows jump lists and taskbar thumbnails before a Windows host exists, native colour/font pickers (kit), screenshot/screencast API (privacy + Wayland portal complexity; spawn `screencapture` if ever needed), drag-out to other apps, Touch Bar, Live Activities (push server), Spotlight/Quick Look plugins until the appex generator exists, biometrics off macOS/iOS, e-ink "widgets" (no platform hook), full `NSAccessibility` (own study).
- **Do not promise**: user-authored code running inside an OS widget process. The widget is a generated shell over a descriptor.
- **Do not overload** `zinc:os`; and **do not auto-expose** any of these to `zinc:script`/`zinc:webview` pages.
- **Unverified**: SDL tray/dialog backend behaviour per OS (only headers read, no run); notification behaviour in unsigned dev builds; whether SDL emits open-file/URL events for macOS `application:openURLs:` (likely needs a small delegate hook, [I]); AppLoad tile/widget possibilities on rMPP; exact Tauri 2 plugin list beyond those confirmed by search; effort numbers.

### Sources (web)
- Tauri plugins: https://v2.tauri.app/plugin/ ; https://github.com/tauri-apps/plugins-workspace
- Electron: https://www.electronjs.org/docs/latest/api/tray ; https://www.electronjs.org/docs/latest/api/app
- SDL3 tray: https://wiki.libsdl.org/SDL3/CategoryTray
- WidgetKit: https://developer.apple.com/documentation/widgetkit/creating-a-widget-extension ; https://useyourloaf.com/blog/widgetkit-for-ios-getting-started/
- .NET MAUI widgets (per-platform native extensions): https://mobiletechlead.com/article/dotnet-maui-10-widgets-ios-android
- Windows widget providers: https://learn.microsoft.com/en-us/windows/apps/develop/widgets/widget-providers ; https://learn.microsoft.com/en-us/windows/apps/develop/widgets/implement-widget-provider-win32
- Android Glance: https://developer.android.com/develop/ui/compose/glance/create-app-widget
- Compose Desktop tray: https://kotlinlang.org/docs/multiplatform/compose-desktop-tray.html
- Portals (FileChooser, Settings, Flatpak integration): https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.FileChooser.html ; https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Settings.html ; https://docs.flatpak.org/en/latest/desktop-integration.html
- KDE plasmoids: https://develop.kde.org/docs/plasma/widget/ ; GNOME background apps: https://www.phoronix.com/news/GNOME-Monitor-Background-Apps
