# HP TouchPad (webOS 3.0.0): a PDK app with no status-bar strip

Status: research, 2026-10-15. Sources read: openwebos/luna-sysmgr, luna-sysmgr-common, the PDK headers in webOSArchive/webos-sdk-redux, the PDK/appinfo docs on sdk.webosarchive.org, and PDK ports on GitHub. Nothing below was run on a device.

## Recommended fix (try in this order, each is one line)

1. **Send the window property `fullScreen:true`.** This is the only thing LunaSysMgr uses to remove the bar. The system manager reads it from the client's `ViewHost_SetWindowProperties(key, json)` message, JSON key `"fullScreen"` (boolean). The client side for a PDK app is Palm's closed `libSDL`/`libpdl`, so how a PDK app triggers it is **unconfirmed**. Candidates, cheapest first:
   - `SDL_SetVideoMode(0, 0, 0, SDL_OPENGL | SDL_FULLSCREEN)` (`SDL_FULLSCREEN = 0x80000000`, in the PDK's `SDL_video.h`). Palm's SDL may map the flag to the property. Today `webos.cpp` passes `SDL_OPENGL` only.
   - Call `PDL_Init(0)` **before** `SDL_Init` / `SDL_SetVideoMode`, as every known GLES2 PDK port does (cocos2d-x webOS, the SDL xserver). Zinc calls `PDL_Init` late, from the `zinc:webos` plugin, and only after the screen is open. If `PDL_Init` is what announces the card to the system manager as a game, calling it late may leave the card in the "normal card" state with the bar.
   - `"uiRevision": "2"` in `appinfo.json` (the docs say it "enables full TouchPad screen use"; without it a web app gets a 320x480 window). For a PDK app it is probably irrelevant, but it is a documented key and costs nothing.
2. **If none of those works:** look at what Palm's own libraries do. On the device, `strings /usr/lib/libSDL-1.2.so.0 | grep -i -E 'fullscreen|WindowProp'` and `strings /usr/lib/libpdl.so | grep -i -E 'fullscreen|WindowProp'`. A hit names the call (the JSON is built by the client, so the string `fullScreen` must be in the client library that sends it).
3. **Last resort, not recommended:** open the system manager's IPC channel ourselves and send `ViewHost_SetWindowProperties`. It is a private Chromium-style `PIpc` protocol; no public example exists.

`"fullScreen": true` in `appinfo.json` does nothing, as measured: LunaSysMgr never reads that key from the app description (no `fullScreen` in `ApplicationDescription.cpp`). The `fullScreen`, `enableFullScreenMode` and `statusBarColor` strings in the binary belong to the window-properties parser (Mojo's `PalmSystem.enableFullScreenMode(true)` and `setWindowProperties({fullScreen:true})`), not to appinfo.

## What the strip is (from the source)

- `CardWindow` keeps `m_winProps.fullScreen`, false until the client sets it (`CardWindow.h:73`).
- Not full screen: the card is laid out in `m_normalScreenBounds = (0, PositiveSpaceTopPadding, width, height - PositiveSpaceTopPadding)` (`CardWindowManager.cpp:276`). `PositiveSpaceTopPadding=28` in `conf/luna.conf:122`; `luna-topaz.conf` does not override it. So the card is treated as the 1024x740 area under a 28 px status bar, and the card window buffer is cut to `height - 28` (`CardWindow.cpp:1528, 2504, 2580`).
- Full screen: `normalOrScreenBounds()` returns the whole 1024x768 (`CardWindowManager.cpp:2822`); `SystemUiController::setWindowProperties` calls `hideStatusBarAndNotificationArea()` and the bar slides off (`SystemUiController.cpp:1782`). The buffer is then used whole (`brushOrigin` shifted by half the difference, `CardWindow.cpp:1673`).
- The `luna-sysmgr` card-host class `CardHostWindow` (native/direct-rendering windows) also drops full-screen mode when the card loses focus (`aboutToFocusEvent`), so the property has to be set again each time the card is focused (UNCONFIRMED whether the client re-sends it).
- So the strip is the status-bar zone of a card that the system manager still considers a normal maximized card. It is not an app-side offset. Why it shows the wallpaper and only ~14 px of the 28 px (28/2 is the offset the launcher code uses for `positiveSpaceTopPadding / 2`) is **unconfirmed**; the mapping 28 -> 14 is a guess from `dimensionsmain.cpp:68` and `OverlayWindowManager.cpp:1921`.

## What the PDK exposes (no direct call)

- `PDL.h` / the PDK docs list no status-bar or window-property call. Full-screen APIs exist only for plug-ins: `PDL_SetFullscreen(w, h, bpp, flags)` (just `SDL_SetVideoMode` for a hybrid plug-in; returns NULL for a native app), `PDL_DismissFullscreen`, `PDL_IsFullscreenPlugin`. `PDL_ScreenTimeoutEnable` is about dimming. Not usable here.
- `PDL_Init(unsigned flags)`: "currently no flags are defined".
- `appinfo.json` keys (docs): `type`, `main`, `requiredMemory` (required for PDK), `uiRevision`, `noWindow`, `plug-ins`, `dockmode`, ... Nothing about the bar.

## Evidence from existing PDK code

- cocos2d-x webOS (`CCEGLView_WebOS.cpp`): `SDL_Init`, then `PDL_Init(0)`, then `SDL_GL_SetAttribute`, then `SDL_SetVideoMode(0, 0, 0, SDL_OPENGL)`, the same call as Zinc. No other full-screen call. The shipped games of this kind ran full screen on the TouchPad, which points at `PDL_Init` order or `appinfo.json`, not at a missing flag (the claim that they showed no bar is from the Lunacy notes, not from a device test).
- X server on webOS (`xserver_webos/hw/kdrive/sdl/sdl.c`): `PDL_Init(0)` before `SDL_Init`, then `SDL_SetVideoMode`.
- EMU7800 for the TouchPad (`appinfo.json`): only `"type":"pdk"`, `"main"`, `"requiredMemory":32`. No full-screen key.
- Lunacy (an Android re-implementation of webOS, not Palm code) states "A PDK card is full screen from the start, no status bar, as on webOS" (`Docs/pdk.md:360`), citing a webOS developer. It is the only statement on real PDK behaviour found; it agrees with the fix list above (a PDK card should not show the bar by itself).

## Test to run on the device (about 5 minutes, one rebuild)

1. Add `"uiRevision": "2"` to `appinfo.json`; reinstall; look at the top rows (a frame with a one-pixel red line on row 0 shows it at once).
2. In `webos.cpp` pass `SDL_OPENGL | SDL_FULLSCREEN` (0x80000000); if the strip stays, move `PDL_Init(0)` (from `libpdl.so`, `dlsym`) to just before `SDL_Init`.
3. In parallel, over ssh: `strings` on `libSDL-1.2.so.0` and `libpdl.so` for `fullScreen` / `WindowProp`, and `grep -i fullscreen /var/log/messages` (LunaSysMgr logs `Full screen mode suppressed. Not enabling full screen` when `m_fullScreenModeSuppressed` blocks it).
4. Check `luna-send -n 1 palm://com.palm.systemmanager/...` is not needed; the status-bar state is not exposed on the public bus.

## Unconfirmed

- Which Palm library call sends `{"fullScreen":true}` for a PDK app (SDL flag, `PDL_Init`, or nothing: it may be sent by the web side only, in which case a pure PDK card relies on another rule).
- Whether `PDL_Init` order matters; whether `uiRevision` affects PDK cards.
- The 14 px (instead of 28 px) strip height.

## Sources

- https://github.com/openwebos/luna-sysmgr : `Src/remote/IpcClientHost.cpp` (`onSetWindowProperties`, JSON keys), `Src/base/SystemUiController.cpp` (`isSetFullScreen`), `Src/lunaui/cards/CardWindow.cpp`, `CardWindowManager.cpp` (`normalOrScreenBounds`), `CardHostWindow.cpp`, `conf/luna.conf`
- https://github.com/openwebos/luna-sysmgr-common : `include/WindowProperties.h`
- https://github.com/openwebos/luna-sysmgr-ipc-messages : `SysMgrMessagesInternal.h` (`ViewHost_SetWindowProperties`)
- https://github.com/webOSArchive/webos-sdk-redux : `pdk/include/PDL.h`, `PDL_JS.h`, `SDL/SDL_video.h`
- https://sdk.webosarchive.org/docs/reference/pdk/plug-in-api-summary.html
- https://sdk.webosarchive.org/docs/reference/config/appinfo.json.html
- https://raw.githubusercontent.com/webOSArchive/webos-sdk-archive/master/docs/reference/pdk/pdl/pdl-set-fullscreen.html
- https://github.com/cocos2d-x/cocos2dx-webos : `cocos2dx/platform/WebOS/CCEGLView_WebOS.cpp`
- https://github.com/dtzWill/xserver_webos : `hw/kdrive/sdl/sdl.c`
- https://github.com/alan-morford/emu7800forwebos : `appinfo.json`
- https://github.com/webOSArchive/Lunacy : `Docs/pdk.md`, `Docs/architecture.md` (window properties)

## Measured on the device (2026-10-15, afternoon)

- The strip is back after two restarts of the tablet, 14 rows, on every PDK card (ours and the video test): a marker line on the program's
  row 0 is hidden, the last row shows; libnapp sends `{ 'fullScreen': true, ... }` itself (its strings) and LunaSysMgr logs `Full screen
  enabled`. `SDL_WM_ToggleFullScreen` answers 0; re-sending window properties after the card is maximized, and skipping our
  `PDL_SetKeyboardState` / `PDL_SetOrientation` calls, change nothing.
- `PositiveSpaceTopPadding=0` in /etc/palm/luna.conf does not help and **makes LunaSysMgr crash in a loop** (SEGV every 11 s), still after
  the file was restored, until a full reboot. Do not touch luna.conf.
- What Zinc does: the program's screen starts under the strip (`top` in display-gl webos.cpp; picture and touches move together; the
  keyboard's bands and the turns count it), `ZINC_WEBOS_TOP` overrides (0: the whole panel).
- The strip showed pieces of old frames now and then: in direct mode nothing drew its rows, and the system sometimes shows them. Each
  swap now clears them to black (`zgl_backend_swap`). Already tried from the app, without effect: `uiRevision: 2`, `SDL_FULLSCREEN`,
  `PDL_Init` before `SDL_Init`. What is left is in the system (LunaSysMgr), see above.
