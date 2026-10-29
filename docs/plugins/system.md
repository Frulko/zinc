# zinc:system

Desktop integration for macOS and Linux apps: notifications, menus, tray, dialogs, window control, shortcuts, deep links, autostart, dock, power, clipboard, opener. Design and per-platform choices: [docs/reports/system-integration.md](../reports/system-integration.md).

```ts
import * as system from 'zinc:system';
system.call('notification.notify', { title: 'Build done' });   // needs "notification" in zinc.json permissions
system.on('menu-click', (args) => console.log(args[0]));
```

- **Permissions** (deny by default): `zinc.json` `"permissions": ["notification", "tray"]` (`feature` or `feature:operation`; `targets.<name>.permissions` may add or remove with `-id`). Importing `zinc:system/<feature>` without it is error Z5006; the native side refuses an op whose id was not compiled in even when the program got past the compiler.
- **Ops**: `plugins/system/ops.json` is the table (op, permission, argument and result shapes, simulator answer). `tools/system-ops` generates `ops.d.ts` and `native/ops.gen.h`; `tests/t0/system_ops.sh` fails on drift.
- **Recording simulator** (the backend in deterministic and headless runs): every call prints `[system] <op> <json>`; `ZINC_SYSTEM_LOG=-|file` chooses where. `ZINC_SYSTEM_SCRIPT=file` delivers events, one line `<tick> <event> args...` (a tick is one pass of the event loop, a frame in a UI app): `menu-click`, `tray-click`, `notification-click|action|reply|close`, `shortcut`, `drop`, `open-url`, `second-instance`, `power`, `appearance`, `window`, `dialog-answer`. Unknown events are logged as errors.
- The macOS and Linux backends and the feature modules (`zinc:system/tray`, ...) arrive task by task (ZN-235..); until then those modules are stubs whose `isSupported()` is false.
- **Phones** (ZN-628): the same op table, with an iOS backend (`native/system.ios.mm`) and an Android one (`native/system.android.cpp` over the Java class `native/android/SystemBackend.java`, also the activity's lifecycle subscriber); `system.backend` is `ios` or `android`. They do local notifications (`notification.notify`, `requestPermission`: Android 13's prompt and iOS's; `cancel`; a tap is `notification-click`), `zinc:system/share` (`share.share`: the system's share sheet, the permission `share`), `opener.open` (a URL in the app that opens it; React Native's `Linking.openURL`), the pickers (`dialog.open`: Android's document picker, iOS's document picker or, when every filter is an image type, the photo picker; the answer comes later, so `open()` waits for the event `dialog-result`, and the paths are copies in the app's cache) and deep links: `zinc.json` `app.urlSchemes` becomes the Android intent filter and iOS's `CFBundleURLTypes`; `deep-link.getCurrent` holds the link that started an Android app, later links (and on iOS every link, which SDL delivers as a dropped URL) are `open-url` events. Haptics are `zinc:haptics`. The other ops keep the simulator's answer there. Proven on the iOS 26 simulator and an Android emulator (API 37, arm64) with `tests/data/mobile-services` (`SERVICES_DO=share|open|notify|pick|photo`).
- **Quitting cleanly** (saving, pausing a speaker, unsubscribing, closing a file before the process ends): send every way out to one async function that runs the steps and then calls `quit()`. The window's close button, the Dock's Quit and a logout reach `window.onCloseRequested` (call `window.keepOpen()` in it, then quit when the work is done); Cmd+Q reaches `menu.onClick('role:quit', ...)` once the app listens for it; `kill` and Ctrl+C reach `sys.onSignal('SIGTERM' | 'SIGINT', ...)` of `zinc:sys`. Give the steps a time limit (a `setTimeout` that quits anyway). `examples/ipod/src/services/quit.ts` is one (`onQuit(name, step)`, 3 s). In a headless run, the `close` of `ZINC_INPUT` asks the close handler too.

## Opener: `zinc:system/opener`

`openUrl(url)`, `openPath(path)` (the system's default app; `zinc.json` `"scopes": {"opener": {"allow": [...]}}` limits them), `reveal(path)` (the file selected in the file manager) and `trash(path): boolean`, Electron's `shell.trashItem`: the file or folder goes to the trash, where the person can put it back. macOS: the Finder's Trash (`NSFileManager trashItemAtURL`). Linux, and the simulator of a deterministic or headless run on every desktop: the freedesktop.org home trash, `$XDG_DATA_HOME/Trash` (default `~/.local/share/Trash`), `files/` and `info/<name>.trashinfo`, which the file managers read; a file on another disk than the home is refused (false), not copied. Windows and phones answer false. All need the permission `opener`.

```ts
import { trash, reveal } from 'zinc:system/opener';
if (!trash('/Volumes/Card/DCIM/IMG_0001.JPG')) console.log('kept: this disk has no trash');
```

## Media controls: `zinc:system/media`

What plays, for the system's media controls: on macOS Control Center's Now Playing (title, artist, album, cover, duration, position,
playing or paused), the keyboard's media keys, and the buttons of AirPods and headsets. The API is the web's Media Session API
(`navigator.mediaSession`), so code written for a browser reads the same. Needs `"media"` in zinc.json `"permissions"`.

```ts
import { mediaSession, MediaMetadata, MediaSessionActionDetails } from 'zinc:system/media';

mediaSession.metadata = new MediaMetadata({ title: 'So What', artist: 'Miles Davis', album: 'Kind of Blue',
                                            artwork: [{ src: '/path/to/cover.jpg' }] });   // a file path; null clears Now Playing
mediaSession.playbackState = 'playing';                                    // 'none' | 'paused' | 'playing'
mediaSession.setPositionState({ duration: 562, position: 12, playbackRate: 1 });   // the system moves it on while playing
mediaSession.setActionHandler('play', () => player.play());
mediaSession.setActionHandler('pause', () => player.pause());
mediaSession.setActionHandler('nexttrack', () => player.next());
mediaSession.setActionHandler('seekto', (d: MediaSessionActionDetails) => player.seek(d.seekTime ?? 0));
```

- Actions: `play`, `pause`, `stop`, `previoustrack`, `nexttrack`, `seekto` (`seekTime`), `seekforward` and `seekbackward` (`seekOffset`, in
  seconds). The play/pause key sends `play` or `pause` from the state you set. An action without a handler is greyed out; `null` removes one.
- Set the position when it jumps (a new track, a seek, play or pause), not on every tick: the system counts it on from the rate.
- `isSupported()` is zinc:platform's `MEDIASESSION`: true on macOS (MPNowPlayingInfoCenter and MPRemoteCommandCenter). Elsewhere every
  call does nothing, and in a headless or deterministic run the recording simulator logs them; `ZINC_SYSTEM_SCRIPT` lines `<tick> media
  <action> [seconds]` press the keys. `dump()` reads back what the system holds (JSON: title, artist, album, artwork, duration,
  position, playbackRate, state, actions).
