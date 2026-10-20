# HP TouchPad (webOS 3.0.0): sensors, keys, LEDs, vibration from a jailed PDK program

Research, 2026-10-15. Sources are web docs and open source trees only; nothing here was run on the device
unless marked "measured" (from the brief). **Unconfirmed** items come with a test command (section 7).

## Summary

| Item | On the TouchPad | Access from a jailed PDK program | Data | Web API |
|---|---|---|---|---|
| Accelerometer | yes (ST LSM303DLH, i2c-0 0x18, from the 3.4-kernel ports; the chip on webOS 3.0 is probably the same, unconfirmed) | **SDL joystick 0** (documented, 30 Hz fixed) or `PDL_EnableSensor(PDL_SENSOR_ACCELEROMETER)` + `PDL_PollSensor` (webOS 3.0.x) | joystick axes 0..2 = x,y,z, int16 range, 32768 = 1 g; PDL: float x,y,z in g | `DeviceMotionEvent.accelerationIncludingGravity` (m/s^2 = g*9.80665), Generic Sensor `Accelerometer` |
| Gyroscope | **chip present** (InvenSense MPU3050, `/dev/mpu`) but only through InvenSense's own driver; no evdev/sysfs | `PDL_SENSOR_ANGULAR_VELOCITY` exists in the API; **whether webOS 3.0 serves it is unconfirmed** (test `PDL_SensorExists`); else root helper on `/dev/mpu` (undocumented ioctl, hard) | PDL: x,y,z rad/s | `DeviceMotionEvent.rotationRate` (deg/s), `Gyroscope` |
| Compass / magnetometer | yes (LSM303DLH mag, i2c-0 0x1e) | `PDL_EnableCompass`/`PDL_GetCompass` (3.0), or the sensor API `PDL_SENSOR_COMPASS` / `MAGNETIC_FIELD` / `ROTATION` / `ORIENTATION` | `PDL_Compass{int confidence 0..100; double magneticBearing; double trueBearing}`; sensor API: degrees, field in uT, raw + bias-corrected | `DeviceOrientationEvent` (`alpha`, absolute), `Magnetometer`, `AbsoluteOrientationSensor` |
| Ambient light | yes (Intersil ISL29023, i2c-0 0x44) | `PDL_SENSOR_ALS` (3.0.x); hidd `LightEventSocket` is reachable only if the jail allows it (unconfirmed) | `PDL_ALSEvent{Sint32 lux}` | `AmbientLightSensor.illuminance` (lux) |
| Orientation | derived from accel (+ mag) | `PDL_SENSOR_ORIENTATION` event, or compute from accel; **no SDL rotate event**: the program draws its own rotation | enum 0 unknown,1 up,2 down,3 normal,4 upside down,5 left down,6 right down | `screen.orientation`, `DeviceOrientationEvent` |
| `PDL_SetOrientation` | n/a | tells the system where the Center button is, so alerts and banners are positioned; **does not rotate anything** | `PDL_ORIENTATION_0/90/180/270` = button bottom/left/top/right | `ScreenOrientation.lock()` (partial analogue) |
| Hardware keys, gestures | volume up/down, power, Center ("home"), gesture area | SDL key events: `PDLK_GESTURE_BACK`, `PDLK_GESTURE_FORWARD`, `PDLK_GESTURE_AREA` (documented); volume/home/media keys: **unconfirmed in SDL** | key down/up | `KeyboardEvent`, Media Session handlers |
| AVRCP / headset buttons | webOS maps them to custom keys: MEDIA_PLAY/PAUSE/STOP/NEXT/PREVIOUS (+ repeat, shuffle), HEADSET_BUTTON | goes to the foreground card through the system; a PDK app's access is **unconfirmed**; fallback: read hidd/AVRCP as root helper | key events | Media Session `setActionHandler('play'/'pause'/'nexttrack'/'previoustrack'/'stop')` |
| Navi LEDs `core_navi_left/right` | yes, sysfs LED class | sysfs is **root only** (measured for lcd-backlight; same for the navi LEDs) -> **root helper** (same one as `setBacklight`) | brightness int; CyanogenMod uses 25 for "on" | none (closest: none) |
| Vibration | LM8502 driver has a vibrator block and `vib_enable`/`vib_duty_cycle`, but **no motor is believed fitted** (unconfirmed) | `PDL_Vibrate(periodMS, durationMS)` exists (since 2.0), returns NOERROR even where nothing moves | - | `navigator.vibrate()` -> no-op returning true/false |

## 1. Accelerometer

**SDL joystick (Palm PDK "Input Handling" guide).** `SDL_Init(SDL_INIT_JOYSTICK)`, `SDL_JoystickOpen(0)`, poll
`SDL_JoystickGetAxis(j, n)` or take `SDL_JOYAXISMOTION` events.

- The accelerometer is "exposed to SDL applications using the Joystick abstraction", sampled at a **fixed 30 Hz**.
- Axes 0, 1, 2 = X, Y, Z. Raw range -32768..32768, **-32768 = -1 g, 32768 = +1 g**; `g = raw / 32768.0`.
- Documented pose table (phone-oriented docs; check the TouchPad axis signs on the device): flat face up (0,0,-1);
  right edge down (1,0,0); left edge down (-1,0,0); bottom edge down (0,1,0); top edge down (0,-1,0).
- The guide was written for the phone line (320x480). The TouchPad's natural orientation is portrait with the Center
  button at the bottom; apps usually run landscape, so **remap axes in Zinc** (landscape = swap x/y and flip one sign;
  confirm with the pose test below).
- Not documented: rate control (fixed 30 Hz), filtering. Expect jitter; add a small low-pass in `zinc:webos`.

**Sensor API (webOS 3.0.x, `PDL_Sensor.h`, `-lpdl`).** `PDL_SensorExists(type)`, `PDL_EnableSensor(type, bool)`,
`PDL_PollSensor(type, &ev)` (no event: NOERROR and `ev.type == PDL_SENSOR_NONE`; `PDL_ESTATE` if not enabled),
`PDL_PollActiveSensors(&ev)`. Types: NONE -1, ACCELEROMETER 0, COMPASS 1, ALS 2, ANGULAR_VELOCITY 3, GRAVITY 4,
LINEAR_ACCELERATION 5, MAGNETIC_FIELD 6, ORIENTATION 7, PROXIMITY 8, ROTATION 9, SHAKE 10. Accelerometer event: float
x,y,z in g. Shake: state 0..3 (starts above 1.3 g, stops at 1.1 g) and magnitude. This API is the documented
"recommended approach" over the old compass calls; no rate parameter is documented.

**hidd sockets.** `HidPlugins.xml` (measured) maps plugins to `/var/run/hidd/AccelerometerCmdSocket` and
`AccelerometerEventSocket` (the 2009-era wiki lists `/var/tmp/hidd/...`; paths moved). sysmgr talks to hidd through
`libhid`/`HidLib.h` (plugin names like `HidAccelerometer`, `HidKeypad`) and over Luna
(`palm://com.palm.hidd/HidAccelerometer/Range`, `.../HidKeypad/RingerState`; `HostArm.h` in luna-sysmgr-common).
**The packet format and the subscribe handshake are not published** (the WebOS Internals page with `HidLib.h` and
`hidTest.c` is gone at the original URL; not recovered). Whether the jail can open these sockets is **unconfirmed**; the
PDK's own SDL path exists precisely so that apps do not need them. Recommendation: use SDL joystick or the PDL sensor
API; do not reverse hidd unless both fail.

Kernel side for reference (TouchPad 3.4 ports, may differ on 3.0.0's 2.6.35): input device `lsm303dlh_acc_sysfs`, poll
interval in `/sys/bus/i2c/devices/0-0018/pollrate_ms` (root).

## 2. Gyroscope, compass, light, orientation

- **Gyroscope.** The MPU3050 is on the board (CyanogenMod `init.tenderloin.rc` chmods `/dev/mpu`, `/dev/mpuirq`).
  webOS-ports' sensorfw config says it has "no evdev or sysfs interface" (InvenSense's `/dev/mpu` driver), so no
  generic reader. The HP Developer Center's TouchPad sensor page lists accelerometer, light sensor and location, no gyro.
  Best guess: webOS 3.0 does not publish it to apps. Test `PDL_SensorExists(PDL_SENSOR_ANGULAR_VELOCITY)`. If false,
  a sensor-fusion `ROTATION` event (accel+mag) is the best the app gets.
- **Compass.** Old API: `PDL_EnableCompass(true)` first, then `PDL_GetCompass(&c)`; errors `PDL_UNINIT`,
  `PDL_INVALIDINPUT`; one doc page says compass is "not currently supported for plug-ins" (applies to plug-ins, not
  apps). New API: `PDL_CompassEvent{float magnetic, trueBearing (degrees), confidence 0..100}`, `PDL_MagneticFieldEvent`
  x,y,z + rawX,rawY,rawZ in uT, `PDL_RotationEvent` {matrix[9], quatW/X/Y/Z, yaw/pitch/roll in degrees} (quaternion maps
  directly to `AbsoluteOrientationSensor`). The LSM303DLH is a known-noisy part; the app must handle low confidence.
- **Ambient light.** `PDL_ALSEvent{lux}`; system dims the screen with it (sysmgr `AmbientLightSensor` via nyx
  `NYX_DEVICE_SENSOR_ALS`, intensity in lux). Sensor-framework ports poll `/sys/bus/i2c/devices/0-0044/lux` at 100 ms to
  1 s. No proximity sensor on the TouchPad (`PDL_SENSOR_PROXIMITY` will not exist).
- **Orientation.** Two separate things: (a) `PDL_SENSOR_ORIENTATION` events describe the device pose; (b) the PDK has
  no "system rotates the card" for a native SDL app: the framebuffer is landscape-native from the program's view, and
  the program rotates its own content and tells the system with `PDL_SetOrientation` so banners and the keyboard match.
  Zinc's `screen.orientation` should therefore be implemented in the runtime (rotate the root transform) and call
  `PDL_SetOrientation`; `lock()` is just "stop reacting to the pose".

## 3. Keys, gestures, AVRCP

- **Gesture area** (black strip under the screen, up to the middle of the Center button): arrives as SDL key events
  `PDLK_GESTURE_BACK`, `PDLK_GESTURE_FORWARD`, `PDLK_GESTURE_AREA` (the last fires on any touch, also with back/forward).
  Map back to `history.back` / Escape and `Backspace` for the UI. `PDL_GesturesEnable(false)` hides the "wave bar" that
  opens Quick Launch from a fullscreen app.
- **System keys.** Nyx (`NYX_DEVICE_KEYS`, read by the Qt Palm platform plugin, a different stack from the PDK's SDL)
  defines: VOL_UP, VOL_DOWN, POWER_ON, HOME (Center button), RINGER_SW, SLIDER_SW, HEADSET_BUTTON, HEADSET_PORT(_MIC),
  OPTICAL, and **MEDIA_PLAY, PAUSE, STOP, NEXT, PREVIOUS, REPEAT_ALL/TRACK/NONE, SHUFFLE_ON/OFF**. These come from
  hidd's Keypad plugin and from Bluetooth input detect (AVRCP over HID/bluetooth). The Center button and power are
  normally consumed by sysmgr (card minimise, suspend); volume and the hardware buttons are consumed by the system
  volume UI. Whether the PDK's SDL receives volume/media keys while the app is foreground is **not documented**: the
  input guide is silent on volume. The sysmgr key path is the reference; the SDL path must be tested.
- **Media control from AVRCP.** Without a delivered key, a program can still react through the audio service:
  `PDL_NotifyMusicPlaying(true)` stops/pauses the system player (prevents two songs at once); it does not subscribe to
  keys. If SDL does not deliver them, a root helper could read hidd's `KeypadEventSocket` and `AvrcpCmdSocket`; format
  unknown (see section 1).
- Web mapping: `KeyboardEvent` for volume/Back; Media Session `setActionHandler` for play/pause/stop/next/previous;
  Zinc's `zinc:webos` should dispatch those handlers from whichever channel works.

## 4. Navi LEDs (Center button light)

- sysfs LED class: `/sys/class/leds/core_navi_left/brightness`, `core_navi_right/brightness` (measured to exist; webOS
  sleepd on other models writes `core_navi_center`, "0" before suspend and "15" after). CyanogenMod's lights HAL
  writes **25 for on, 0 for off** to both files (max not probed; try 0..255).
- Owner: root on webOS (CM's init.rc chmods them 0664 for `system` on Android; webOS has no such rule). From a jailed
  program as non-root: **no**. Use the root helper (`tools/webos-helper` mechanism that already does
  `setBacklight`); the program asks through a file under `/tmp/zinc`.
- The notification pulse patterns ("blink") are separate: the LM8502 LED engine is driven through `/dev/lm8502` by
  ioctl (`LM8502_DOWNLOAD_MICROCODE`, `STOP_ENGINE`), 96 x uint16 microcode programs (CM ships pulse_quick,
  pulse_long, pulse_double, reset). On webOS the equivalent pattern comes from the system's notification service. For Zinc,
  blink the two sysfs LEDs from the helper with a timer instead of loading microcode.
- Web mapping: none. Expose as a Zinc-only plugin call (`webos.setNaviLed(level)`).

## 5. Vibration

`PDL_Vibrate(periodMS, durationMS)` (webOS 2.0+): period 20 = 50 vibrations/s, 0 = max frequency; negative arguments
`PDL_INVALIDINPUT`; `PDL_ECONNECTION` if the card cannot be reached. The call is a request to the system, valid on phones.
The TouchPad's LM8502 driver (header: "LED + Vibrator + Camera flash") has the vibrator interface (`vib_enable`,
`vib_duty_cycle`, `vib_direction`, `vib_start` under `/sys/devices/i2c-3/3-0033/vibrator/vib0/`), but the TouchPad has
no motor to my knowledge (reviews list none); the kernel interface is generic across the chip family. **Unconfirmed**:
write `vib_enable=1`, duty 100, start 1 and feel/listen. Treat `navigator.vibrate` as a no-op that returns `true`.

## 6. Jail access (what is known)

- Measured (brief): the program runs as non-root in groups `video,pulse-access`. Sysfs LED/backlight are root only.
- SDL (Palm's `libSDL-1.2.so.0`, which links `libLunaSysMgrIpc` and `libnapp`) delivers touch, gestures and the
  accelerometer joystick through the LunaSysMgr IPC, not through files: **this path needs no extra permission** and is
  the safe default.
- `/var/run/hidd/*` is world-reachable or not: **unconfirmed** (`ls -l`). The command sockets control hidd (range,
  poll rate), so a jail policy denying them is plausible.
- Luna bus calls from a PDK program go through `PDL_ServiceCall` (whitelist by app id); hidd's own Luna methods
  (`palm://com.palm.hidd/...`) are likely not whitelisted.

## 7. On-device tests (novacom root shell, BusyBox 1.17)

```sh
# a) sockets and permissions, and which process answers
ls -l /var/run/hidd/ ; ps | grep -i hidd
grep -i -E "socket|name|path" /etc/hidd/HidPlugins.xml | head -60
# b) kernel side: i2c names, gyro node, light sensor, input devices
for d in /sys/bus/i2c/devices/*; do echo "$d: $(cat $d/name 2>/dev/null)"; done
ls -l /dev/mpu* /dev/lm8502 /dev/input 2>&1
cat /proc/bus/input/devices | grep -E "Name|Handlers"
cat /sys/bus/i2c/devices/0-0044/lux 2>&1          # lux, if the chip is powered
# c) LEDs: left on, right on, off (value 25 is the CM "on"; try 255)
echo 25 > /sys/class/leds/core_navi_left/brightness; echo 25 > /sys/class/leds/core_navi_right/brightness
sleep 2; echo 0 > /sys/class/leds/core_navi_left/brightness; echo 0 > /sys/class/leds/core_navi_right/brightness
cat /sys/class/leds/core_navi_left/max_brightness 2>&1
# d) vibrator (does the file exist? does the TouchPad buzz?)
ls /sys/devices/i2c-*/*/vibrator/vib0/ 2>&1
V=$(ls -d /sys/devices/i2c-*/*/vibrator/vib0 2>/dev/null | head -n1)
[ -n "$V" ] && { echo 1 > $V/vib_enable; echo 100 > $V/vib_duty_cycle; echo 1 > $V/vib_start; sleep 1; echo 0 > $V/vib_enable; }
# e) key events as seen by the system (volume, power, Center): which input nodes exist
strings /usr/lib/libhid.so | grep -i -E "socket|accel|keypad|avrcp|/var" | head -40
# f) luna bus: is there a vibrate/alert service?
luna-send -n 1 palm://com.palm.vibrate/vibrate '{"duration":200}'
```

Program-side tests (cross-built PDK test, run through the app launcher so it is jailed): print
`PDL_SensorExists(t)` for t = 0..10; enable ACCEL, COMPASS, ALS, ANGULAR_VELOCITY, ORIENTATION and print one event every
200 ms; open `SDL_JoystickOpen(0)` and print `SDL_NumJoysticks()`, `NumAxes`, raw axis values in the four rest poses
(to fix the landscape remap); log every `SDL_KEYDOWN` `sym`/`scancode` while pressing volume, power, Center, a swipe
back, and a Bluetooth headset or keyboard media key; as the app user, `ls -l /var/run/hidd` and try
`connect()` on `AccelerometerEventSocket` (a 5-line C program; BusyBox 1.17 `nc` has no unix-socket mode).

## 8. Plan for `zinc:webos`

1. Accelerometer: SDL joystick (already linked), remap to landscape, expose `DeviceMotionEvent` and `Accelerometer`.
2. Magnetometer/orientation/ALS/gyro: probe with `PDL_SensorExists`, expose only what exists; derive
   `DeviceOrientationEvent` from `ROTATION` (quaternion) or accel+compass.
3. Keys: SDL events first; media keys through whichever of SDL / root-helper-on-hidd works (decide after test e).
4. LEDs: root helper, same file protocol as the backlight.
5. Vibration: `PDL_Vibrate` wired to `navigator.vibrate`, documented as a no-op on this model.

## Sources

- Palm PDK, Input Handling (accelerometer as joystick, 30 Hz, gestures): http://www.banneret.nl/webos/documentation/all/dev-guide/pdk/input-handling.html
- PDK, Accessing Device Sensors; PDL data types (sensor types and events, `PDL_Compass`, `PDL_Orientation`, `PDL_Err`):
  https://sdk.webosarchive.org/docs/dev-guide/pdk/accessing-device-sensors.html , https://sdk.webosarchive.org/docs/reference/pdk/pdl-data-types.html
- PDK pages: `PDL_GetCompass`, `PDL_Vibrate`, `PDL_SetOrientation`, `PDL_PollSensor`, `PDL_GesturesEnable`, `PDL_NotifyMusicPlaying`,
  "New in webOS 3.0+" (all under https://sdk.webosarchive.org/docs/).
- TouchPad sensors (accelerometer, light sensor, location): https://sdk.webosarchive.org/docs/design/enyo/guidelines/hardware-features/sensors.html
- luna-sysmgr-common `Src/base/hosts/HostArm.cpp` / `HostArm.h` (nyx ALS, orientation sensor, hidd Luna URIs); openwebos/qt
  `src/plugins/platforms/palm/nyxkeyboardhandler.cpp` (custom key map); openwebos/sleepd `src/pwrevents/machine.c` (navi LED).
- webOS-ports meta-webos-ports `sensord-tenderloin-halium.conf` (LSM303DLH, ISL29023, MPU3050 notes).
- CyanogenMod `android_device_hp_tenderloin` (`liblights/lights.c`, `init.tenderloin.rc`) and `hp-kernel-tenderloin`
  (`drivers/leds/leds-lm8502.c`, `board-rump.c`).
- WebOS Internals "Hidd" wiki (hidd plugins, `HidLib.h`): https://webos-internals.org/wiki/Hidd (404 when fetched; seen only in search snippets).
