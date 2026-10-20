# HP TouchPad: the device's features as web APIs in Zinc (plan, 2026-10-15)

Owner's request (2026-10-15): look at everything the TouchPad offers (camera, sensors, battery, the Touchstone, Bluetooth...), follow the
web standards where one exists, and do the rest in their spirit. Today Zinc has none of these APIs: `navigator` holds `userAgent` only
(lib/std/web.ts). Sources: touchpad-sensors.md, touchpad-camera.md, touchpad-system-services.md (research and measures of the same day),
hp-touchpad-webos.md section 14 (zinc-helper, the governor, full screen).

## How (one shape for all)

- **Web globals first** (`navigator.getBattery()`, `navigator.wakeLock`, `navigator.onLine`, `document.visibilityState`, `screen.orientation`,
  `navigator.mediaDevices.getUserMedia`, `DeviceMotionEvent`, the Generic Sensor classes, `Notification`, `navigator.mediaSession`,
  `navigator.vibrate`), declared in lib/std/web.ts and lib/zinc.d.ts, with one native backend per platform. A program written for a browser
  runs unchanged; a missing feature answers as a browser without it does (a rejected promise, `NotSupportedError`, a no-op).
- **In the spirit** for what the web has no API for, in `zinc:webos` (device) or `zinc:system` (desktop): `setPerformance`,
  `setBacklight`, `openPort` (done), indicator LEDs, the charger's kind.
- **The webOS backend** uses, in this order: Palm's SDL events (accelerometer as joystick 0, `SDL_ACTIVEEVENT`, gesture keys), libpdl
  (`PDL_ScreenTimeoutEnable`, `PDL_GetCompass`, `PDL_SetKeyboardState`, `PDL_ServiceCallWithCallback` for Luna answers, queued to the main
  loop), and zinc-helper (root) for what the jail may not read (hidd sockets, sysfs LEDs, the private bus).
- **Desktop backends** (macOS first, Linux in the cross-platform pass): IOKit power sources, SCNetworkReachability, AVFoundation camera,
  NSProcessInfo activity (wake lock), ambient light where the Mac has it.

## The table

| Feature | Web API (or "spirit") | TouchPad path | Status on the tablet | Desktop | Effort | Priority |
|---|---|---|---|---|---|---|
| Card shown / hidden | Page Visibility (`visibilitychange`, `document.hidden`) | `SDL_ACTIVEEVENT` (APPACTIVE / APPINPUTFOCUS) in display-gl | documented | window focus, minimize | S | **1** |
| Keep the screen on | Screen Wake Lock (`navigator.wakeLock.request('screen')`) | `PDL_ScreenTimeoutEnable(false)` (done as `screenTimeout`) | measured | IOPMAssertion | S | **1** |
| Battery and charger | Battery Status (`navigator.getBattery()`: level, charging, events) + `source: 'usb' \| 'ac' \| 'wireless'` (spirit) | powerd signals `batteryStatus` / `chargerStatus` (addmatch, then the queries), relayed by zinc-helper into /tmp/zinc | measured (USB: `type usb`; the Touchstone's value to read) | IOKit IOPS | S | **1** |
| Network | `navigator.onLine`, `online` / `offline`, Network Information (`navigator.connection`) + `ssid` (spirit) | `com.palm.connectionmanager/getstatus` subscribe | measured | SCNetworkReachability | S | **1** |
| System keyboard | text input of zinc:gfx (`startTextInput`), VirtualKeyboard API | `PDL_SetKeyboardState`, text as SDL key events | documented | IME | S | **1** |
| Full speed, backlight, ports | spirit: `setPerformance`, `setBacklight`, `openPort` | zinc-helper | **done** | n/a | done | done |
| Accelerometer, device tilt | `DeviceMotionEvent`, `DeviceOrientationEvent`, `Accelerometer` | SDL joystick 0 (3 axes, 32768 = 1 g, 30 Hz), remapped to the landscape screen | documented, to measure | none (Mac has no accelerometer) | M | 2 |
| Screen orientation | Screen Orientation (`screen.orientation`, `lock()`) | the program rotates its own frame (the system does not rotate a PDK card); orientation from the accelerometer | documented | n/a | M | 2 |
| Compass | `Magnetometer`, `AbsoluteOrientationSensor` (heading) | `PDL_EnableCompass` / `PDL_GetCompass` (bearing, confidence) | in libpdl | none | S | 3 |
| Ambient light | `AmbientLightSensor` (lux) | hidd `LightEventSocket` (root only, format unknown): zinc-helper, after reading the protocol | to reverse | Mac ALS (IOKit) | M | 2 (night dimming of a wall tablet) |
| Camera | Media Capture (`getUserMedia({video})`, `MediaStreamTrack`, `ImageCapture.grabFrame`) | GStreamer 0.10 `camsrc` (NV12 160x128 to 640x480, 30 fps) through the device's libs, or V4L2 `/dev/video0` | the driver failed to open (I/O error: a wedged sensor? reboot then retry) | AVFoundation | L | 2 |
| Headset and Bluetooth media keys | Media Session (`navigator.mediaSession`: metadata, `setActionHandler('play'...)`) | AVRCP / headset keys: SDL keys? hidd Avrcp socket (root)? | to find | MPRemoteCommandCenter | M | 2 (the music app) |
| Gesture area (back) | `keydown` of `BrowserBack` / a `popstate`-like event | `PDLK_GESTURE_BACK` / `FORWARD` / `AREA` SDL keys | documented | n/a | S | 2 |
| Notifications | Notifications API (`new Notification(title, {body})`) | org.zinc.notifier (headless web app): a `popupalert` window over every card, `height=96` as a window feature (Mojo's Child.createWindow), `PalmSystem.stageReady()`; the status bar's banner if refused | **done** (seen over a full-screen card, 2026-10-15) | NSUserNotification (exists in zinc:system?) | M | done |
| Indicator LEDs | spirit: `setIndicator(on \| off \| blink)` | sysfs `core_navi_left/right` (root: zinc-helper) | measured (files there) | n/a | S | 3 |
| Sound out | Web Audio, `HTMLAudioElement` | SDL audio through PulseAudio (the jail is in `pulse-access`) | to check against zinc's audio plugin | done on desktop | M | 2 |
| Location | Geolocation | no GPS on the Wi-Fi TouchPad, HP's network location is gone: `POSITION_UNAVAILABLE` (an IP lookup in the spirit, opt-in) | n/a | CoreLocation | S | 4 |
| Vibration | Vibration API (`navigator.vibrate(ms or [on, off, ...])`) | `PDL_Vibrate(0, ms)`; a pattern is played by zinc:web | **done** (the owner felt it, 2026-10-15) | n/a | XS | done |
| Gyroscope | `Gyroscope` | an MPU3050 is on the board, no reader found on webOS 3.0.0 | unknown | n/a | ? | 4 |
| Bluetooth | Web Bluetooth (BLE): **impossible** (BT 2.1 + EDR, no BLE) | in the spirit: Wi-Fi UDP/OSC (done: the music app's port 7777), BT classic serial (SPP) via `com.palm.bluetooth` later | n/a | Web Bluetooth via CoreBluetooth | L | 4 |
| Language, device | `navigator.language`, `navigator.userAgentData` | `PDL_GetLanguage`, `PDL_GetHardware`, `PDL_GetDeviceName` | in libpdl | system locale | XS | 3 |

Not in libpdl of webOS 3.0.0 (measured: the exported names): the generic sensor calls (`PDL_EnableSensor`, `PDL_PollSensor`) that later
PDKs document. The accelerometer goes through SDL's joystick; the light sensor through hidd.

## Order proposed

1. **Visibility, wake lock, battery + charger source, network, system keyboard** (all small; the music app uses them at once: release full
   speed when hidden, show "on the Touchstone", react to Wi-Fi loss, type with the system keyboard).
2. **Accelerometer + orientation, ambient light, media keys, sound out, gesture back** (a game, the night dimming, a headset).
3. **Camera** (largest: first unblock the driver on the device), **notifications, LEDs, compass, language**.
4. The rest answers "not available" the web's way.

Each feature: its desktop backend in the same change where macOS has the hardware (the rule: built and tested on the Mac); the Linux one
goes under "Cross-platform pass" in backlog/later.md.
