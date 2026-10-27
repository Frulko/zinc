# AppLoad window-state and widget patches

Five patches on [AppLoad](https://github.com/asivery/rm-appload) v0.6.0, applied in order by `build.sh`:

- `0001-window-state.patch`: a qtfb client can minimize and restore its own window and knows when it is hidden. A Zinc
  app on the reMarkable Paper Pro uses it for its "Home" button: the app minimizes itself, xochitl is usable again, and
  the app keeps running. It also applies cleanly on AppLoad master (df974a6, 2026-10).
- `0002-widgets-and-icons.patch` (on top of 0001): a client can show a part of its framebuffer as a widget, a small
  card over xochitl; the minimized window becomes a compact pill; the window bar gets vector icons.
- `0003-compact-widgets.patch` (on top of 0002): a tap on a widget card's header collapses it to the header alone (the
  client is hidden) and expands it again; the window bar, the card and the pill get a finer, shared look.
- `0004-pinned-apps.patch` (on top of 0003): apps listed in `pinned.json` get their own entry in xochitl's sidebar, under
  AppLoad's, that opens them as their tile does.
- `0005-docked-window.patch` (on top of 0004, experimental): a client can dock its window under xochitl's own top header, which
  stays xochitl's, live.
- `0006-instant-refresh-mode.patch` (on top of 0005): `MESSAGE_SET_REFRESH_MODE` and `MESSAGE_REQUEST_FULL_REFRESH` no longer pause the
  connection a fixed second: they return once the GUI thread applied them (`Qt::BlockingQueuedConnection`), a few ms. Capability bit 3
  (`CAPABILITY_INSTANT_MODE` = 8) tells the client, which then switches to the fast waveform for a pinch at once.
- `0007-header-keeps-dock.patch` (on top of 0006): a press on xochitl's header leaves a docked window docked.
- `0008-raise-xochitl-layers.patch` (on top of 0007): what that press opens (the burger's sidebar, a menu: items of xochitl's scene, not all in
  Qt Quick Controls' overlay) is found by comparing the scene with a picture taken at the press, and its branch is raised over the window
  until it closes; `journalctl -u xochitl | grep "over the docked window"` names it.
- `0009-lift-sidebar-alone.patch` (on top of 0008): the sidebar is lifted alone (moved for that time under the parent of the window's
  branch, above it) instead of its whole branch, so xochitl's page behind it stays under the window; the branch is raised only when the
  two parents do not cover the same rectangle.

## Protocol (0001)

Added to `src/qtfb/common.h`; every existing message is unchanged.

| Name | Value | Direction | Payload |
|---|---|---|---|
| `MESSAGE_SET_WINDOW_STATE` | 9 | client to server | `int windowState` in `ClientMessage`'s union (same slot as `refreshMode`): `WINDOW_STATE_MINIMIZE` 0, `WINDOW_STATE_RESTORE` 1 |
| `STATE_CHANGED_REASON_VISIBILITY` | 1 | server to client | `DeviceStateChangedContents.visibility.visible`: 1 shown, 0 minimized |

- Minimize does what the window's "_" button does: it leaves fullscreen first, then minimizes. Restore un-minimizes and,
  for an app with `disablesWindowedMode` that was fullscreen when it minimized itself, goes back to fullscreen.
- The server sends the visibility state in the initial state packets (`MESSAGE_DEVICE_STATE_INIT`, after the rotation
  one) and with `MESSAGE_DEVICE_STATE_CHANGED` each time the window is minimized or restored, by the client or by the user.
- An unmodified AppLoad drops a client that sends an unknown message type. A client therefore sends
  `MESSAGE_SET_WINDOW_STATE` only after it received a `MESSAGE_DEVICE_STATE_INIT` with reason 1.
- A value other than 0 or 1 is refused like an invalid refresh mode (the client is disconnected).
- The "_" button now also shows while a window is minimized, so a fullscreen-only app (whose topbar has no "_" button)
  that minimized itself can be brought back by the user.

## Protocol (0002)

| Name | Value | Direction | Payload |
|---|---|---|---|
| `STATE_CHANGED_REASON_CAPABILITIES` | 2 | server to client | `DeviceStateChangedContents.capabilities.flags`: bit 0 (`CAPABILITY_WINDOW_STATE`) message 9 and reason 1, bit 1 (`CAPABILITY_WIDGETS`) message 10, window state 2 and visibility 2 |
| `MESSAGE_SET_WIDGET` | 10 | client to server | `x, y, w, h` in the `update` slot of `ClientMessage` (`type` unused, 0): the widget's rectangle in framebuffer pixels; `w` or `h` <= 0 removes the widget |
| `WINDOW_STATE_WIDGET` | 2 | client to server | new value of `MESSAGE_SET_WINDOW_STATE` |
| `VISIBILITY_WIDGET` | 2 | server to client | new value of `visibility.visible` (0 minimized, 1 shown, 2 shown as a widget) |

- Capabilities are sent in the initial state packets (`MESSAGE_DEVICE_STATE_INIT`), after rotation and visibility. A
  client sends message 10 or window state 2 only after it saw bit 1; a server with 0001 alone sends no reason 2.
- A widget rectangle that does not lie inside the framebuffer disconnects the client, like other invalid messages.
- Window state 2 without a widget rectangle minimizes. Removing the rectangle while the widget is shown minimizes too.
- Widget mode: the window becomes a card showing exactly the rectangle, framebuffer pixels to screen pixels (no
  scaling, no rotation), under an 88 px header with the app's tile (its `icon.png`), its name, open (back to the window
  as it was: full screen if it was, state 1) and close (the window's close). The card is dragged by its header; its
  position is saved per app id in `widget-positions.json` in AppLoad's directory (`xovi/exthome/appload`) and clamped
  to the screen. Pen and touch inside the card reach the client as `MESSAGE_USERINPUT` at `x + rect.x, y + rect.y`.
  A `MESSAGE_UPDATE` repaints only its intersection with the rectangle, and nothing when it misses it.
- Visibility is sent only when it changes: going from the pill to the widget sends 2 alone, not 1 then 2.
- The minimized window (state 0) is a rounded pill: tile, name, open, close, 3 px black outline, 88 px targets. The
  window bar uses the same icons instead of the "_", "□"/"▭" and "X" glyphs: minimize, maximize/restore, close.

0003 makes the header 64 px, the outline 2 px and the pill a 12 px rounded rectangle (see Protocol (0003)).

The patch also changes `xovi/make.sh`: it piped `rcc` into a `sed` that quits early, which under `pipefail` fails
the build with SIGPIPE once the embedded resources outgrow the pipe buffer (the new icons do); `rcc` now writes a file.

Icons: [Lucide](https://lucide.dev) v0.462.0 (`lucide-static`), ISC licence (Copyright (c) for portions of Lucide are
held by Cole Bemis 2013-2022 as part of Feather (MIT); all other copyright (c) for Lucide are held by Lucide
Contributors 2022). Files `resources/icons/lucide-{minus,maximize,minimize,maximize-2,x}.svg`, stroke set to black
(2.5 wide in 0002, Lucide's own 2 since 0003), each with its `@license` comment; the licence text: https://lucide.dev/license.

## Protocol (0003)

No new message or value; the collapsed widget reuses the visibility values of 0001 and 0002.

| Event | Server to client (`MESSAGE_DEVICE_STATE_CHANGED`, reason 1) |
|---|---|
| Tap on the widget card's header: collapse | `visibility.visible` 0 (hidden, as minimized) |
| Tap on the collapsed header: expand | `visibility.visible` 2 (widget) |
| Client sets window state 2 for an app whose card was left collapsed | nothing new: it stays 0 until the user expands it |

- A tap is a press and release on the header, outside its open and close buttons, that moves less than the 12 px drag
  threshold; a longer move drags the card as before.
- Collapsed, the card is its header alone (tile, name, open, close), as wide as the card; the client gets no input and
  need not draw (an update it sends lands in the framebuffer but nothing of it is shown). On expand the card shows
  the framebuffer's last pixels; a client repaints the widget's rectangle when it sees visibility 2 again.
- Open and close work from the collapsed header as from the card; open sends 1, as before.
- The collapsed state is saved with the position: `widget-positions.json` holds
  `{"<app id>": {"x": .., "y": .., "collapsed": true|false}}` (an entry without `collapsed`, from 0002, is expanded).
  Expanding near the bottom of the screen moves the card up so it stays whole on the screen.
- Look: the window bar, the card header and the pill are 64 px high, built of 64 px cells (the touch targets) with
  30 px Lucide icons (stroke 2), a 36 px tile, the name at 15 pt regular, a 2 px black outline, a 1.5 px black hairline
  under the bar and the card header, and a 12 px radius for the card and the pill. The window bar's buttons lose their
  boxes. The card's content sits 6 px inside the outline, clear of the rounded corners.

## Protocol (0004): pinned apps

No qtfb message: a file. `pinned.json` in AppLoad's directory (`/home/root/xovi/exthome/appload/pinned.json`) is a JSON array of
AppLoad application ids, in the order of the sidebar: `["external::zinc-web", "external::zinc-pdf"]` (an AppLoad tile directory
`zinc-web` is the id `external::zinc-web`, the key `widget-positions.json` uses too).

- Each id that AppLoad knows gets a sidebar entry under AppLoad's: the app's `icon.png` and name from its tile, and a tap launches
  it as a tap on its tile does (`AppLoadLauncher.launchApplication(id)`: full screen, or its window for a windowed app). An id it
  does not know (a removed tile) shows nothing; no file is no pins.
- AppLoad watches the file and its directory: a new list shows at once, without restarting xochitl. Write it to a temporary
  file in the same directory and rename it over `pinned.json` (a reader never sees half a file). A change also reloads AppLoad's
  list of apps, so a tile made just before it is pinned is found.
- Writer (the Zinc Hub, not done yet): a "Pin to sidebar" toggle per installed app adds or removes `external::zinc-<name>`, keeps
  the other ids (pins of other tools) and their order, and appends new pins at the end.
- Not verified on the tablet before the first install: the sidebar's item type showing a PNG icon (AppLoad's own entry uses an SVG
  from its resources), and the hashed names copied from AppLoad's own entry (text, icon, onClicked, the menu's close).

## Protocol (0005): docked window

| Name | Value | Direction | Payload |
|---|---|---|---|
| `CAPABILITY_DOCKED` | 4 (bit 2) | server to client | in `capabilities.flags`: window state 3, visibility 3 and reason 3 |
| `WINDOW_STATE_DOCKED` | 3 | client to server | new value of `MESSAGE_SET_WINDOW_STATE` |
| `VISIBILITY_DOCKED` | 3 | server to client | new value of `visibility.visible` |
| `STATE_CHANGED_REASON_INSETS` | 3 | server to client | `DeviceStateChangedContents.insets.top`: the height of xochitl's header, screen pixels (= framebuffer pixels) |

- Docked, the window shows the framebuffer rectangle `(0, H, fbW, fbH - H)` 1:1 at screen `(0, H)`: no window bar, no card, no
  outline, no rotation or scaling (as a widget). `H` is the insets' `top`. Input in the window reaches the client at `y + H`, and a
  `MESSAGE_UPDATE` repaints only its part below `H`. The client pads its layout by `H` (Zinc: the top safe area).
- `H` is sent in the initial state packets (after the capabilities) and each time it changes; it is read when the window docks and every
  2 s while it is docked. Where it comes from, in order: `{"top": N}` in `dock.json` in AppLoad's directory
  (`/home/root/xovi/exthome/appload/dock.json`); else xochitl's live item tree: the tallest visible item, outside AppLoad's windows and
  the popup overlay, that spans the screen's width at y 0 and is 48 to 240 px high; else **120 px, a guess** (not measured on the tablet).
  xochitl's QML names are hashed per OS release, so the header is found by its geometry, not by a qmldiff hook. Each new value is
  logged with the item it came from: `journalctl -u xochitl | grep "docked windows start"`. Launched from AppLoad's own launcher, the
  header found is the launcher's bar while the launcher is open.
- The header belongs to xochitl: a press on it goes to xochitl alone and the window stays docked (0007; 0005 minimized it until the popup
  closed). What it opens is raised over the window until it closes (0008).
- Open on the pill, or on the widget card of a window that went from docked to widget, docks it again. Restore (1) from docked goes back
  to the full window (full screen when it was full screen before docking). Minimize (0) keeps it docked for open.

## Build

```sh
integrations/remarkable-engine/appload/build.sh    # writes dist/rmpp/appload-window.so
```

It follows AppLoad's own CI (`.github/workflows/build-release.yml`): AppLoad `v0.6.0` plus the patches, xovi at a pinned
commit, `xovi/make.sh` inside `eeems/remarkable-toolchain:latest-rmpp` pinned by digest. Needs Docker and git; a few
minutes on an M1. First build (2026-10-25, 0001 alone): sha256 `46ec75d1b65a6fd54ec2ec98d2918db524976140ac87fd6bde3995f5cb8580e1`.
With 0002 (2026-10-25): sha256 `e1139bf4eeb0852a14fb71958e96c430e1ab8b26a6461c5d0c3906165856951b`.
With 0003 (2026-10-25): sha256 `6cb5a3de9e583240ae1f74bcd1d8647b64dc565595fb5b6ae655d5ee3dfda41d` (same imports as with 0002).
With 0004 (2026-10-26): sha256 `cd263b0663ea10aa4037818faa7df11890de932b62e3594039944685eff28918` (qmldiff of the sidebar not checked off the tablet).
With 0005 (2026-10-26): sha256 `b73ed2fd448785c966808643e1826640d230b35c08c07b970625d010fa114641` (the dock not checked on the tablet; the QML passes qmllint on the Mac).
The result is an aarch64 ELF with the same xovi entry points (`_xovi_construct`, `_xovi_depconstruct`,
`LINKTABLENAMES`, `LINKTABLEVALUES`) and the same `NEEDED` libraries as the 0.6.0 release asset; its imports are the
release's plus three from Qt6Core (`QIODevice::write(QByteArray)`, `QRect::operator&`, the `QRect` metatype).

## Install on the Paper Pro

Keep each build that worked next to the one you install, so any of them comes back with one copy:

```sh
scp -O dist/rmpp/appload-window.so root@10.11.99.1:/home/root/xovi/appload.so.compact-0003   # staged, not active
ssh root@10.11.99.1 '
  cd /home/root/xovi &&
  [ -f appload.so.0.6.0 ] || cp extensions.d/appload.so appload.so.0.6.0 &&   # the release, once
  cp extensions.d/appload.so appload.so.previous &&
  cp appload.so.compact-0003 extensions.d/appload.so'
```

Then restart xochitl ONCE, through a guard that goes back to the stock UI at the first crash (never loop restarts: at most 2 in
10 minutes; `docs/targets/remarkable-paper-pro.md`, "Safety rules"):

```sh
# /tmp/zn-guard.sh on the tablet
/home/root/xovi/start
for i in $(seq 1 45); do
  sleep 1
  n=$(systemctl show xochitl -p NRestarts --value); s=$(systemctl show xochitl -p ActiveState --value)
  if [ "$n" != "0" ] || [ "$s" = "failed" ]; then echo "crash after ${i}s (NRestarts=$n state=$s): back to stock"; /home/root/xovi/stock; exit 1; fi
done
echo "alive 45s NRestarts=$n state=$s"
```

It prints `alive 45s NRestarts=0 state=active` when the UI came up; then read `journalctl -u xochitl --since -2min` for AppLoad or
QML errors. Go back: copy `appload.so.previous` (or `appload.so.0.6.0`) over `extensions.d/appload.so`, then the guard again.
The tablet of 2026-10-25 keeps `appload.so.0.6.0`, `appload.so.window-0001`, `appload.so.widgets-0002` and runs 0003.

## Upstream pull requests

Two pull requests: the window state is small and useful alone, the widgets depend on it. 0003 goes into the
second one (`git am` 0002 then 0003 on its branch).

### 1. Window state

Title: `qtfb: let a client minimize/restore its window and learn its visibility`

> This adds a small, backward-compatible extension to the qtfb protocol so a client can send its own window to the
> background and know when it is hidden (for example a "Home" button in a full-screen app that keeps running).
>
> - `MESSAGE_SET_WINDOW_STATE` (9), with an `int windowState` in the `ClientMessage` union: 0 minimizes (leaving
>   fullscreen first, as the "_" button does), 1 restores (back to fullscreen for apps with `disablesWindowedMode`).
> - `STATE_CHANGED_REASON_VISIBILITY` (1) with `visibility.visible`: sent in the initial state packets and on every
>   minimize/restore, so a client learns both its visibility and that the server supports message 9 (older servers
>   drop clients sending unknown types, so clients should wait for reason 1 before sending it).
> - The "_" button stays visible on a minimized window so a fullscreen-only app that minimized itself can be restored.
>
> Tested by building with the release workflow's toolchain image; the exported xovi entry points are unchanged.

The owner opens it from a fork (nothing is pushed by the build):

```sh
gh repo fork asivery/rm-appload --clone && cd rm-appload
git checkout -b qtfb-window-state origin/master
git am ../zinc/integrations/remarkable-engine/appload/0001-window-state.patch
git push -u origin qtfb-window-state
gh pr create -R asivery/rm-appload --base master --head <your-user>:qtfb-window-state \
  --title "qtfb: let a client minimize/restore its window and learn its visibility" --body-file pr.md
```

(`pr.md`: the quoted text above.)

### 2. Widgets and icons (after the first is merged, or stacked on its branch)

Title: `qtfb: client widgets, a compact minimized pill and vector icons for the window bar`

> Builds on the window-state extension. A qtfb client can show a part of its framebuffer as a small card over the
> main UI (a timer, a now-playing control, a clock), and the window bar gets real icons.
>
> - `STATE_CHANGED_REASON_CAPABILITIES` (2), sent in the initial state packets: `capabilities.flags` bit 0 = window
>   state (message 9, visibility reason 1), bit 1 = widgets. Clients test a bit before using an extension instead of
>   guessing from other packets.
> - `MESSAGE_SET_WIDGET` (10), payload in the `update` slot: the rectangle of the framebuffer to show; `w`/`h` <= 0
>   removes it. A rectangle outside the framebuffer is refused (the client is disconnected, as for other invalid
>   messages).
> - `MESSAGE_SET_WINDOW_STATE` accepts 2 (widget): the window becomes a card showing that rectangle 1:1, with a
>   header (app icon, name, open, close), draggable, its position remembered per app in `widget-positions.json`.
>   Input inside it is forwarded in framebuffer coordinates; updates outside the rectangle repaint nothing, so the
>   e-ink refresh stays as small as the card. Visibility reports 2 while shown as a widget.
> - The minimized window is a compact pill (icon, name, open, close) instead of a full-width bar, and the window bar
>   uses Lucide SVG icons (ISC) instead of text glyphs.
>   A tap on a widget's header collapses it to the header (the client sees visibility 0) and another expands it
>   (visibility 2); the collapsed state is remembered with the position.
>
> Tested by building with the release workflow's toolchain image; the exported xovi entry points are unchanged.

```sh
git checkout -b qtfb-widgets qtfb-window-state
git am ../zinc/integrations/remarkable-engine/appload/0002-widgets-and-icons.patch
git am ../zinc/integrations/remarkable-engine/appload/0003-compact-widgets.patch
git push -u origin qtfb-widgets
gh pr create -R asivery/rm-appload --base master --head <your-user>:qtfb-widgets \
  --title "qtfb: client widgets, a compact minimized pill and vector icons for the window bar" --body-file pr2.md
```
