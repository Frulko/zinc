# webOS 3.0.0 (HP TouchPad): system keyboard and orientation for a PDK GL app

Research of 2026-10-15 for `plugins/display-gl/src/webos.cpp` and `webos_device.cpp`. Sources: Palm's own
binaries pulled from the tablet (`/usr/lib/libSDL-1.2.so.0.11.2`, `libnapp.so`, `libpdl.so`, `libhelpers.so`, all
dated 2011-06-10, **not stripped**, disassembled with `llvm-objdump`; addresses below are in those files), the PDK
headers (`webOSArchive/webos-sdk-redux`, `pdk/include`), the open LunaSysMgr (`openwebos/luna-sysmgr` 1393f0a,
`luna-sysmgr-ipc-messages` ecca303, `luna-sysmgr-common` cdcaac6, `keyboard-efigs` ccf4da1: these are the
3.0.5-based Open webOS sources, so they describe the server side close to, not exactly as, 3.0.0), Palm's
`badfont` sample, and three ports that shipped on the TouchPad (dtzWill's `xserver_webos` 186645e, `cocos2dx-webos`
293ca32, `nizovn/qt5-qpa-webos-plugin` ffb0a10).

## 1. The recipe

**Keyboard**

1. Show: `PDL_SetKeyboardState(PDL_TRUE)` when a text field takes focus; hide: `PDL_SetKeyboardState(PDL_FALSE)`
   on blur. It sends `ViewHost_EditorFocusChanged(focused, EditorState{})` (an all-zero editor state: plain text
   layout, no "Go/Done" variant, no autocap). Call it again with the current state on `SDL_ACTIVEEVENT` gain
   (the card coming back), as the X server does.
2. **No event tells a PDK app that the keyboard is up or how tall it is**, on 3.0.0. LunaSysMgr does send
   `View_Resize(w, h)` to the card when the positive space changes, but Palm's `NGameCard::onResize`
   (libnapp `0x75f0`) only logs it (`HTracker_funcTrack("napp_ntrace", "onResize", "Card::onResize width %d
   height %d resizeBuffer %d", ...)`) and never calls the SDL resize callback; `View_KeyboardShown` and
   `View_AdjustForPositiveSpace` are not handled at all. So never wait for `SDL_VIDEORESIZE`.
3. Take the keyboard height from the user's keyboard size, which is a system preference:
   `PDL_ServiceCallWithCallback("palm://com.palm.systemservice/getPreferences",
   '{"keys":["x_palm_virtualkeyboard_settings"],"subscribe":true}')` → `{"layout":"azerty","language":"fr",
   "keyboard size":0}` (measured). Size → height: **-2: 243, -1: 291, 0: 340, +1: 393** px (keyboard-efigs
   `TabletKeyboard.cpp:245-248` and `:435-438`; 340 measured on this tablet: keyboard top at screen y 428; the same
   table is hard-coded in dtzWill's X server `sdl.c:62-69`, for both orientations). Fallback when the call is
   refused: 340.
4. Visible band while the keyboard is up (landscape, H = 768, k = height): on this tablet the card is shrunk to
   `H - k` around the screen's centre, the wallpaper shows in the top `k/2` rows (measured: a 170 px band for
   k = 340) and the keyboard covers the bottom `k` rows. So the program's surface becomes
   **1024 x (H - k - k/2) = 1024 x 258, at buffer row k/2 = 170** (to confirm with the test pattern of §6, T2,
   which also says whether the buffer is cropped in place or shifted; if T2 shows the buffer row 0 at the top of
   the visible band, the offset is 0 instead of k/2). Relayout to that size, draw it at that offset, map touches
   with the same offset, and grow back to 1024 x 768 when the keyboard goes.
5. The keyboard's own "hide" key reaches the program on 3.0.0 as **`SDL_KEYDOWN` + `SDL_KEYUP`, sym 230, unicode
   230, mod 0**: LunaSysMgr hides the keyboard and sends `View_RemoveInputFocus`, which `NGameCard::onRemoveInputFocus`
   (libnapp `0x7bb0`) turns into a synthetic key 230 (`mov r12, #230`). It is *not*
   `PDLK_GESTURE_DISMISS_KEYBOARD` (24): that one arrived with webOS 3.0.2 (`xserver_webos/sdl.c:122`). Treat
   `sym == 230 && unicode == 230`, or `unicode == 24`, or `sym == 24`, as "keyboard dismissed": blur the field, call
   `PDL_SetKeyboardState(PDL_FALSE)` (keeps the system and the program in step, Palm's `badfont.cpp:145-149` does
   it), grow the surface back, and **never insert it as text** (the screenshot `kb2.png` shows "æuæææææ": each
   hide press became an "æ"). Cost: a typed "æ" (U+00E6, long press on "a") is indistinguishable and closes the
   keyboard on 3.0.0; "Æ" still types.
6. Enter: sym 13, unicode 13. For a single-line field Zinc's UI handles it (submit) and the field blurs, which
   hides the keyboard (rule 1); for a multi-line field it inserts a newline. Backspace: sym 8 (the keyboard
   repeats it itself; a long hold sends repeated Backspace with Shift, i.e. word delete, which SDL does not
   report: plain Backspace is fine).
7. Text: **use `unicode`, not `sym`**, for anything printable (`unicode >= 32 && unicode != 127`). The path is
   IME → `View_KeyEvent(Qt key, modifiers)` → `NGameCard::onKeyEvent` (libnapp `0x7a20`) → SDL
   `SDL_WebOsEventTranslateKey` (libSDL `0x695dc`), which sets `unicode = key & 0xffff` and lower-cases only
   `sym` for A-Z. Letters come as Qt codes `A`..`Z` with Shift, or lowered when not shifted (onKeyEvent does it),
   digits and ASCII symbols as themselves, accents (long press: é è ê à ç ù...) as their real code point
   (`TabletKeyboard.cpp:975-983`, lower or upper case already applied). No Shift/Ctrl key events come from the
   on-screen keyboard (the shift state is inside it), so `mod` is 0: the case is in `unicode`.
8. Do not treat sym 229/231 as gestures when `unicode != 0`: å (0xE5) and ç (0xE7) arrive as sym 229/231 with
   unicode 229/231, while the real gesture keys (Qt `0x01200002`/`0x01200009` → `0xE0E5`/`0xE0E7`) arrive as
   sym 229/231 with unicode 0. Back (Qt `0x01200001`) → sym 27, unicode 0. The TouchPad has no gesture area;
   these matter only for a Bluetooth keyboard.

**Orientation (an app option: `auto`, `landscape`, `portrait`, or a fixed one)**

9. Keep the GL surface 1024 x 768: `SDL_SetVideoMode(0, 0, 0, SDL_OPENGL | SDL_FULLSCREEN)`. LunaSysMgr never
   rotates a PDK card's buffer (`CardHostWindow::resizeWindowBufferEvent`, `CardHostWindow.cpp:149`: "Don't
   rotate. Not now. Not ever."), Palm's sample says GL fails at 768 x 1024 (`badfont.cpp:63-64`), and no event
   reports a turn. The program rotates its own picture and its touches.
10. Pose from the accelerometer (joystick 0, polled, rule 13): with `a = (ax, ay)` in g, pick the quadrant of
    `atan2(ay, ax)` only when `|a| > 0.5 g` (tilted more than 30 degrees from flat), the angle is within 30
    degrees of the quadrant's centre, and the pose has held 300 ms; flat or in between keeps the last one. The
    axis signs per pose are measured in T4 (dtzWill's thresholds, `sdl.c:988-1020`: x < -10000 → 0, y > 10000 →
    90, x > 10000 → 180, y < -10000 → 270, on raw int16).
11. On a turn: logical size 1024 x 768 (rotation 0 or 180) or 768 x 1024 (90 or 270); relayout; draw with the
    rotation applied at the end (fold it into the renderer's projection and scissor, or render to an FBO of the
    logical size and draw one rotated quad: one full-screen pass, about 2 ms on the Adreno 220). Touches, from the
    framebuffer `(X, Y)` with W = 1024, H = 768, content turned clockwise by r:
    r = 0: `(X, Y)`; r = 180: `(W-1-X, H-1-Y)`; r = 90: `(Y, W-1-X)`; r = 270: `(H-1-Y, X)`.
12. Then call `PDL_SetOrientation(p)` with the matching value: it does not move the picture, it fixes the
    **system UI's** rotation, so the keyboard, banners and alerts are drawn the user's way up. Chain (decoded):
    `PDL_SetOrientation` (libpdl `0xe850`) maps 0 → "bottom", 1 (90) → "right", 2 (180) → "top", 3 (270) → "left";
    `NGameCard::setOrientation` (libnapp `0x7f90`) maps "bottom" → `Orientation_Up` (3), "top" → `Down` (4),
    "left" → `Left` (5), "right" → `Right` (6) and sends `ViewHost_Card_SetAppFixedOrientation(o, bool)`
    (message `0x303b`); LunaSysMgr turns that into `setRequestedSystemOrientation` (`SystemUiController.cpp:1056-
    1072`: Up → FixedPortrait mode... named for phones). On the TouchPad (`HomeButtonOrientationAngle=270`,
    `DisplayWidth=1024`, measured in `/etc/palm/luna-platform.conf`), `Up` is the framebuffer's own landscape:
    **PDL_ORIENTATION_0 and 180 are the two landscapes, 90 and 270 the two portraits** (cocos2d-x does
    `kOrientationPortrait → PDL_ORIENTATION_90`, `CCApplication_WebOS.cpp:137`). Which portrait is which (button
    left or right) is T4. A PDK card is locked to `Up` by default (`CardHostWindow.cpp:99-101`), which is why the
    keyboard is landscape until the program says otherwise. When the system UI is portrait, the keyboard is
    along the user's bottom edge, i.e. a band of framebuffer columns; the band and the card shrink in that
    orientation are T2 again in portrait.
13. Locked: never read the pose; call `PDL_SetOrientation` once with the locked value.

**Events to take care of**

14. Accelerometer flood: after `SDL_InitSubSystem(SDL_INIT_JOYSTICK /*0x200*/)` and `SDL_JoystickOpen(0)`, call
    `SDL_JoystickEventState(SDL_IGNORE /*0*/)`. No `SDL_JOYAXISMOTION` (7) is queued any more and SDL stops updating
    the axes on its own (Palm's `SDL_PumpEvents`, libSDL `0x132dc`, calls `SDL_JoystickUpdate` only while a joystick
    event type is enabled: the standard SDL 1.2 code). Read it when wanted: `SDL_JoystickUpdate();
    SDL_JoystickGetAxis(j, 0..2)` (int16; the PDK documents 32768 per g, the scale is checked in T4), at
    most once a frame, 5 to 10 Hz for auto-rotate alone; close the joystick when nothing needs it (locked
    orientation and no `devicemotion` listener). Reason beyond the CPU: SDL 1.2's queue holds 127 events, and three
    axis events per sample at 30 Hz compete with touches and keys.
15. Type 24 (`SDL_USEREVENT`) with bytes `18 .. .. .. 10 e1 00 00 <ptr>`: `user.code = 0xE110 = PDL_COMPASS`,
    `user.data1` = a `PDL_Compass*` (`PDL_types.h:49-57`). It comes from `PDL_EnableCompass(PDL_TRUE)`
    (`webos_device.cpp:102`). Enable the compass only while a compass/`deviceorientationabsolute` listener exists,
    and drop the other PDL user codes too: `0xE100` GPS update, `0xE101` GPS failure, `0xE120` pending JS.
16. Type 17 (`SDL_VIDEOEXPOSE`): posted when the card becomes active again (`ActivateCb` → `FB_ActiveTransition` /
    `Fbcon_GLES_ActiveTransition` → `SDL_PrivateExpose`, libSDL `0x62740`-`0x62858`): draw a full frame (no partial
    redraw), and re-send the keyboard state (rule 1).

## 2. Confirmed and inferred

| Statement | Status |
|---|---|
| No `SDL_VIDEORESIZE` when the keyboard shows | Measured (raw event log) and explained: `NGameCard::onResize` only logs (libnapp `0x75f0`); Palm's SDL `ResizeCb` → `SDL_PrivateResize` (libSDL `0x6286c`, `0x16be4`) would post it, but only `NPluginCard::onSetWindow` (hybrid plug-ins) calls the resize callback |
| The resize message itself reaches the app on 3.0.0 | Inferred from the open LunaSysMgr (`CardWindowManagerStates.cpp:85-98` `resizeWindow`, `CardWindow.cpp:741-753` `View_Resize`; `allowResizeOnPositiveSpaceChange` defaults to true, `WindowProperties.h:86`). T1 checks it |
| Hide key = synthetic sym 230 / unicode 230 | Measured (sym 230; screenshot shows "æ" typed) and decoded (libnapp `0x7bb0`) |
| `PDLK_GESTURE_DISMISS_KEYBOARD` = 24 from 3.0.2 on | Source: `PDL_types.h:104`, X server comment `sdl.c:122`; Qt5 plug-in and `badfont.cpp` test `unicode == 24` |
| Key translation (Return 13, Backspace 8, Shift 128 → 304, Alt 129 → 307, Ctrl 130 → 305, 131 → 303, gesture keys) | Decoded (libnapp `0x7a20`, libSDL `0x695dc`) |
| Accents arrive as code points | Source (`TabletKeyboard.cpp:975-983`); T3 checks |
| Keyboard heights 243/291/340/393 | Source (keyboard-efigs) + X server table; 340 measured for size 0 |
| Visible band = rows k/2 .. H-k | Measured top band (170 = 340/2, `kb.png`, `kb2.png`) and consistent with `CardHostWindow::paintBase` centring a fullscreen card's buffer in a shorter card (`CardHostWindow.cpp:463`); the buffer-row mapping is T2. The X server (3.0.4) used rows 0 .. H-k: the behaviour may differ between 3.0.0 and 3.0.4 |
| `PDL_SetOrientation` turns the system UI only | Decoded chain above; Lunacy measured on a TouchPad that it turns the banners and not the picture (`Lunacy/Docs/pdk.md`) |
| 0/180 = landscapes, 90/270 = portraits on the TouchPad | Inferred (`HomeButtonOrientationAngle=270` measured, `CardHostWindow::isOrientationPortrait`, cocos2d-x mapping); T4 |
| `PDL_SetKeyboardState` = `ViewHost_EditorFocusChanged` | Inferred: message `0x3036` with a bool and a 52-byte zeroed struct (libnapp `0x8240`), matching `SysMgrMessagesInternal.h:371` |
| Joystick events stop with `SDL_IGNORE`; axes then move only on `SDL_JoystickUpdate` | Decoded (`SDL_PumpEvents` `0x132dc`, `SDL_SYS_JoystickUpdate` `0x6b7d0`); T5 |
| 3.0.0's libpdl has no `PDL_EnableSensor`/`PDL_PollSensor` | Measured (`llvm-nm -D libpdl.so`): the sensor API of `PDL_Sensors.h` is 3.0.x-later; `touchpad-sensors.md` should say so |
| Type 24 = compass | Header (`PDL_COMPASS 0xE110`) and the logged bytes |

## 3. What does not exist (so nobody looks again)

- No PDL call for the keyboard height or the card size: `PDL_GetScreenMetrics` is the panel (1024 x 768, 132 dpi),
  "not the current application's card" (`PDL.h:145-148`). 3.0.0's libpdl exports are listed by
  `llvm-nm -D libpdl.so` (84 functions, none about the card).
- No orientation event: `PDL_SENSOR_ORIENTATION` is not in 3.0.0; SDL has no rotate event.
- Palm's SDL exports `SDL_WebOsHookRegisterResizeCallback(cb, user)` (libSDL `0x687d4`, one slot): registering
  there replaces SDL's own callback and would still never fire for a game card (rule 2).
- The other ports did not solve it either: the Qt5 plug-in returns a fixed 100 px keyboard rectangle
  (`qwebosinputcontext.cpp` `keyboardRect`), the X server shrinks its screen by a user-chosen keyboard size
  (`sdl.c:1054-1061`), cocos2d-x only toggles the keyboard.

## 4. A way to get the live size (if T1 shows the resize arrives)

`HTracker_funcTrack(const char* category, const char* func, const char* fmt, ...)` is an import of libnapp from
`libhelpers.so`. A function of that name exported by the Zinc executable takes precedence for every library loaded
after it (ELF global lookup; the executable must put it in `.dynsym`: `-Wl,--export-dynamic-symbol=HTracker_funcTrack`
with zig/lld). When `func` is `"onResize"` and `fmt` starts with `"Card::onResize"`, the first two variadic ints
are the card's width and height: store them in atomics (it runs on libnapp's IPC thread) and let `zgl_backend_poll`
turn a change into the new surface size. Forward to the real one via `dlsym(RTLD_NEXT, ...)` only if tracking is
wanted. This replaces the table of rule 3 with the system's own numbers, including portrait and any later keyboard
size change. Choose it only after T1; the table works without it.

## 5. In Zinc's code

- `webos.cpp:59-87` `key()`: rules 5, 7, 8 (text from `unicode`; dismiss check before the text; 229/231 text when
  `unicode != 0`). It already closes the keyboard on 230 and returns before the text.
- `webos.cpp:193-194`: the `SDL_VIDEORESIZE` branch never fires; replace it with the keyboard state (shown flag set
  by `PDL_SetKeyboardState` calls in `webos_device.cpp:88` and cleared on dismiss) plus the height of rule 3, and
  report the band as the surface: `zgl_backend_size`, `zgl_backend_surface`, and an offset for drawing and touches.
- A `rotation` state (0/90/180/270) beside it, applied in the swap path and in `take()` (rule 11), set from the app
  option and the polled pose, and `PDL_SetOrientation` on each change.
- `webos_device.cpp:102`: enable the compass on demand (rule 15). The joystick: rule 14.

## 6. On-device test plan

Install as today (`tools/webos-apps`), launch with `luna-send`, screenshots with
`luna-send -n 1 palm://com.palm.systemmanager/takeScreenShot '{"file":"/tmp/x.png"}' < /dev/null`; logs with the
existing `/tmp/zinc/glinfo` raw event log.

- **T1, does `View_Resize` arrive?** `echo TRACK_ALL > /media/internal/tconfig.txt` (libhelpers reads it; the
  category is `napp_ntrace`), launch the app, show the keyboard, hide it, change the keyboard size in Settings,
  repeat in portrait (after T4). `grep onResize /media/internal/tracking.txt` shows `Card::onResize width W height H`
  if it does. Remove `tconfig.txt` and `tracking.txt` afterwards.
- **T2, the band.** A test program (or a page) that fills the screen with horizontal stripes labelled with their
  buffer row every 32 px and a column ruler. Screenshot with the keyboard up for each size (-2..1): note the first
  visible buffer row and its screen row, and the keyboard's top. Tap three marked points with the keyboard up and
  compare the logged SDL coordinates with the screen positions. Repeat after `PDL_SetOrientation(1)` and `(3)`.
- **T3, keys.** With the raw log on, type: a-z, Shift + letter, caps lock (double Shift), the AZERTY digit row and
  its long presses, long presses é è ê ë à â æ ç ù œ, Enter, Backspace (tap and hold), the hide key, and with a
  Bluetooth keyboard arrows, Esc, Tab. Expected: rule 7's table; record sym/unicode/mod per key.
- **T4, orientation.** For p = 0..3: `PDL_SetOrientation(p)`, show the keyboard and send a banner; photograph which
  edge the keyboard and banner sit on relative to the home button. Read the three axes in four poses (button left,
  right, top, bottom; flat). Gives the pose → p table and the signs for rule 10.
- **T5, accelerometer.** Count events per second with joystick events on, then with `SDL_IGNORE` + polled reads;
  check the axes still change; type fast with the program at 30 fps and check no key or release is lost.
- **T6, compass.** Type 24 / `0xE110` events stop after `PDL_EnableCompass(PDL_FALSE)`.
