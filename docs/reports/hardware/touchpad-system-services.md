# HP TouchPad (webOS 3.0.0): system services for Zinc programs

Research, 2026-10-15. Sources: webOS archive SDK (sdk.webosarchive.org: PDK `pdl-*` pages, "Accessing Services", "Application Interrupt Handling", services Display Manager, Connection Manager, Power Management) which were fetched. The Open webOS sources (powerd, luna-sysmgr, PmWiFiService) and the Power/Bluetooth/System Service references could not be fetched (404/403), so those entries come from memory and are marked **[U]** (unconfirmed: verify with the commands below on the device). **[C]** = confirmed in the fetched docs.

## Summary

| Topic | webOS path | Jail ok? | Web API |
|---|---|---|---|
| Battery, charger | `palm://com.palm.power/com/palm/power/batteryStatusQuery`, `chargerStatusQuery`, signals `batteryStatus`/`chargerStatus` [U]; gauge "a6" | Unknown, likely private bus only; ask the root helper | `navigator.getBattery()` + `source` extension |
| Network | `palm://com.palm.connectionmanager/getstatus` `{"subscribe":true}` [C] | Yes (documented public) | `navigator.onLine`, `online`/`offline`, `navigator.connection` |
| Screen state | `palm://com.palm.display/status` (or `/control/status`) `{"subscribe":true}` [C] | Likely yes (documented) | Page Visibility (partly) |
| Wake lock | `PDL_ScreenTimeoutEnable(PDL_FALSE)` [C]; `com.palm.power activityStart` [C] | Yes | `navigator.wakeLock.request('screen')` |
| Visibility, fullscreen | `SDL_ACTIVEEVENT`: `SDL_APPACTIVE` / `SDL_APPINPUTFOCUS` [C]; `PDL_Minimize`, `PDL_CustomPauseUiEnable` [C] | Yes | `visibilitychange`, Fullscreen API |
| Keyboard, orientation | `PDL_SetKeyboardState`, `PDL_SetOrientation` [C]; text as SDL key events [U] | Yes (`PDL_EOTHER` for plugins) | VirtualKeyboard API, `screen.orientation.lock` |
| Notifications | `PDL_BannerMessagesEnable` only blocks/allows system banners [C]; posting: `palm://com.palm.systemmanager/addBannerMessage`, `createAlert` [U] | Unknown; fall back to helper | Notifications API |
| Location | `PDL_EnableLocationTracking` + `PDL_GetLocation` [C]; TouchPad has no GPS (likely), network location servers dead [U] | Yes (call exists) | Geolocation API (deny or manual fix) |
| Audio | SDL audio (PulseAudio) [U]; `PDL_NotifyMusicPlaying` [C]; media keys `com.palm.keys` [U] | Yes for output; keys unknown | Web Audio, Media Session (partial) |
| Bluetooth | `com.palm.bluetooth/*` (BT 2.1+EDR, no BLE) [U] | Unknown; helper | none (Web Bluetooth impossible) |
| Locale, time, device | `PDL_GetLanguage`, `PDL_GetDeviceName`, `PDL_GetUniqueID`, `PDL_GetHardwareID` [C]; `com.palm.systemservice/time/getSystemTime` [U] | Yes | `navigator.language`, `Intl`, `userAgentData` |

## 0. Calling services from the PDK (threading)

[C] signatures (PDK reference):

```c
PDL_Err PDL_ServiceCall(const char *uri, const char *payload);   // fire and forget
PDL_Err PDL_ServiceCallWithCallback(const char *uri, const char *payload,
        PDL_ServiceCallbackFunc callback, void *user, PDL_bool removeAfterResponse);
typedef PDL_bool (*PDL_ServiceCallbackFunc)(PDL_ServiceParameters *params, void *user);
PDL_Err PDL_UnregisterServiceCallback(PDL_ServiceCallbackFunc callback);
// accessors inside the callback:
PDL_ParamExists, PDL_GetParamString/Int/Double/Bool, PDL_GetParamJson (whole answer as JSON)
```

- `uri` is `palm://<service>/<method path>`, `payload` is a JSON string. Returns `PDL_NOERROR` or `PDL_ECONNECTION` (not dispatched). `removeAfterResponse=PDL_FALSE` keeps the callback for subscriptions; one callback function pointer identifies the subscription (unregister takes the function, not a handle: use one function per subscription, or one function plus a `user` that dispatches by topic). The callback returns `PDL_bool` (the docs' example returns `PDL_TRUE`; meaning of the return value is not documented, return TRUE).
- The docs say nothing about the thread **[U]**. libpdl links the luna-service glib main loop; the callback almost certainly runs on a libpdl-internal thread, not in the SDL event loop (SDL 1.2 does not pump the bus). Safe design, independent of the answer: the callback only copies `PDL_GetParamJson()` into a mutex-protected queue; the main loop drains it and raises Zinc events. Never call SDL, GL or the Zinc VM from the callback.
- Test: in the callback print `pthread_self()` and compare with the main thread's; call a subscription with the main loop blocked in `SDL_Delay` and see whether the callback still prints.
- Which services a third-party app may call is decided by the ls2 role files of the public bus (`pub` roles), not by the PDK. Definitive check on the device: `ls /etc/palm/ls2/roles/pub/ 2>/dev/null; grep -l "com.palm.power" /etc/palm/ls2/roles/*/* 2>/dev/null` (path **[U]**, may be `/etc/luna-service2/` or `/etc/palm/luna-service/`); `ls-monitor` shows live traffic.

Test conventions (BusyBox 1.17, no `timeout`): `luna-send -n N` exits after N replies; `< /dev/null` stops it reading stdin. `-P` selects the public bus, `-a <appid>` sets the caller id **[U]** (flags differ per build; try `luna-send` with no args for usage). A call that "prints nothing" is also what you get when the bus drops a call denied by the role file, so always repeat with `-P` and without.

## 1. Battery and charging

webOS [U, from powerd]: service `com.palm.power`, category `/com/palm/power`.

```sh
luna-send -n 1 palm://com.palm.power/com/palm/power/batteryStatusQuery '{}' < /dev/null
luna-send -n 1 palm://com.palm.power/com/palm/power/chargerStatusQuery '{}' < /dev/null
```

Remembered answer shape [U]: `{"returnValue":true,"percent":87,"percent_ui":87,"temperature_C":29,"current_mA":-310,"voltage_V":4.01,"capacity_mAh":5000}` (units and exact key names to verify). `percent` is the raw gauge, `percent_ui` the value the UI shows (rounded, reaches 100 only when full). Charger [U]: `{"returnValue":true,"connected":true,"name":"USB"|"Touchstone"|..., "type":"usb"|"inductive"|"ac"}`: key names unverified, so read the real answer once on each source (USB host, wall adapter, Touchstone) and map by whatever differs. The Touchstone is inductive and also puts the card in "exhibition mode": **[C]** the display service reports `dockMode:true` only on the Touchstone, a reliable `wireless` flag even if the power service is out of reach.

Signals [U]: powerd broadcasts `batteryStatus` and `chargerStatus` as signals; subscribe by match:

```sh
luna-send -n 2 palm://com.palm.bus/signal/addmatch '{"category":"/com/palm/power","method":"batteryStatus"}' < /dev/null
luna-send -n 2 palm://com.palm.bus/signal/addmatch '{"category":"/com/palm/power","method":"chargerStatus"}' < /dev/null
```
First reply is the addmatch acknowledgement, the second the first signal (may take minutes for the battery; plug/unplug for the charger).

Why `chargerStatusQuery` printed nothing within 2 s (hypotheses, none proven): (a) the call was refused by the role file of the bus luna-send used (silent, no error reply); (b) the method is only reachable on the private bus or only answers to a subscriber (`{"subscribe":true}`) of the powerd client; (c) powerd in 3.0.0 emits the state as a signal only. Next steps in this order: retry with `-P`, with `{"subscribe":true}` and `-n 1`, and with the addmatch form above while plugging the charger; run `ls-monitor` in a second shell to see whether the call reaches powerd. If only a root/private call works, the helper does it.

Sysfs: `/sys/class/power_supply` is empty here. The gauge is the "a6" (I2C a6_0/a6_1, TI/Maxim fuel gauge on the TouchPad) read by the kernel's `a6` driver **[U]**. Probe: `ls -l /sys/class/a6* /dev/a6* /sys/bus/i2c/devices/ 2>&1; ls /sys/bus/i2c/drivers/ ; find /sys -name '*a6*' 2>/dev/null | head; cat /sys/bus/i2c/devices/*/name`. If values exist, they are raw gauge registers (no scaling known): prefer the bus; with a root helper read sysfs/`/dev` and serve a socket.

Web mapping: `navigator.getBattery()` -> `{charging, level (percent/100), chargingTime, dischargingTime, onchargingchange, onlevelchange, ...}`. `chargingTime`/`dischargingTime` are not reported by webOS: compute from the `current_mA` and `capacity_mAh` if present, else `Infinity`. Non-standard extra `source: "usb"|"ac"|"wireless"|"none"`, plus `temperature`, `voltage`.

## 2. Network

[C] `palm://com.palm.connectionmanager/getstatus` (Mojo name `getStatus`; try both spellings). Request `{"subscribe":true}`; answer (doc example):

```json
{"returnValue":true,"isInternetConnectionAvailable":true,
 "wifi":{"state":"connected","ipAddress":"10.91.1.98","interfaceName":"eth0","ssid":"OneTeam","bssid":"00:17:DF:A9:F7:6D","networkConfidenceLevel":"excellent","onInternet":"yes","isWakeOnWifiEnabled":true},
 "wan":{"state":"disconnected"},"vpn":{"state":"disconnected"},"bridge":{"state":"disconnected"}}
```
(Documented as public in the SDK; `bridge` is the PAN/Bluetooth tether.) Test: `luna-send -n 2 palm://com.palm.connectionmanager/getstatus '{"subscribe":true}' < /dev/null`. Signal strength is not in this answer; `palm://com.palm.wifi/getstatus` [U] returns `{"status":"connected","networkInfo":{"ssid":..,"signalBars":..,"signalLevel":..,...}}` (private service, unconfirmed); sysfs alternative from the jail [U]: `cat /proc/net/wireless /sys/class/net/eth0/operstate`, `ifconfig eth0`.

Web mapping: `navigator.onLine = isInternetConnectionAvailable`; `online`/`offline` events on change. `navigator.connection`: `type` = `wifi`/`cellular`(never)/`bluetooth`(bridge)/`none`; `effectiveType` from `networkConfidenceLevel` (excellent->4g, fair->3g, poor->2g, a guess); `downlink`/`rtt` unknown; extras `ssid`, `ip`.

## 3. Screen, system sleep, visibility, fullscreen

Display [C]: `palm://com.palm.display/` method `status` (the task text and Mojo use `control/status`; the PDL doc example uses `palm://com.palm.display/status`: test both). `{"subscribe":true}` answers `{"returnValue":true,"event":"request"|"displayOn"|"displayDimmed"|"displayOff","state":"on"|"off"|"dimmed","dockMode":false,"subscribed":true}`.
```sh
luna-send -n 2 palm://com.palm.display/status '{"subscribe":true}' < /dev/null
luna-send -n 2 palm://com.palm.display/control/status '{"subscribe":true}' < /dev/null
```
Brightness: `palm://com.palm.display/control/setProperty` `{"maximumBrightness":0-100}` [U, private, root helper]; sysfs `ls /sys/class/backlight /sys/class/leds` [U].

Wake lock [C]: `PDL_ScreenTimeoutEnable(PDL_FALSE)` stops dimming; **the default is "never dims"** while fullscreen, so `wakeLock.request` = ensure FALSE, `release()` = `PDL_ScreenTimeoutEnable(PDL_TRUE)` (the only way the screen can then time out). The CPU/system sleep is separate: `palm://com.palm.power/com/palm/power/activityStart` `{"id":"<appid>.zinc-1","duration_ms":900000}` [C: documented method names `activityStart`/`activityEnd`, public; the doc page spells them `acitivityStart`; maximum 15 min, renew]. Sleep timeout is user-set 30 s-3 min.

Visibility [C]: `SDL_ACTIVEEVENT` with `event.active.gain` and `state`:
- `SDL_APPACTIVE` gain 0: app paused (card minimized / system alert): stop animation, draw at most 1 fps, repaint on `SDL_VIDEOEXPOSE`, switch `SDL_PollEvent` to `SDL_WaitEvent`; CPU must stay below 10% idle. gain 1: active again.
- `SDL_APPINPUTFOCUS` gain 1: the app is fullscreen (maximized); gain 0: card view.
- `PDL_CustomPauseUiEnable(PDL_FALSE)` lets the system draw the resume (play) overlay; default assumes the app draws its own. `PDL_Minimize()` (webOS 2.0+) cards the app from code.
Web mapping: `document.visibilityState = (APPACTIVE && APPINPUTFOCUS) ? "visible" : "hidden"`; `visibilitychange`; `document.hidden`. Screen off (`state:"off"`) also maps to hidden. Whether screen-off emits `SDL_APPACTIVE` is not documented: derive it from the display subscription. Fullscreen API: a PDK app is always fullscreen when maximized (see `webos-fullscreen.md`); `requestFullscreen()` is a no-op that resolves, `exitFullscreen()` = `PDL_Minimize()`.

## 4. Keyboard and orientation

[C] `PDL_Err PDL_SetKeyboardState(PDL_bool bVisible)`: `PDL_EOTHER` = a plugin (hybrid) may not show it; `PDL_ECONNECTION` = card unreachable; not supported for hybrid apps. Text arrives as ordinary SDL 1.2 `SDL_KEYDOWN`/`SDL_KEYUP` events; with `SDL_EnableUNICODE(1)` `keysym.unicode` holds the character [U, standard SDL 1.2; verify including backspace/enter/shift and non-US layouts]. The keyboard height is not reported [U]; the OS draws it over the app, so Zinc must know the rectangle: measure once per orientation (in landscape about 1/3 of the screen height) and hardcode it.
Web mapping: `navigator.virtualKeyboard` `{overlaysContent, boundingRect, show(), hide(), ongeometrychange}`; focus on a text field calls `PDL_SetKeyboardState(PDL_TRUE)`, blur calls FALSE; geometry from the measured table.

[C] `PDL_SetOrientation(PDL_ORIENTATION_0|90|180|270)`: only tells the system where to place pop-up alerts and banners (value defined by where the center button is); returns `PDL_INVALIDINPUT` for a bad value. It does **not** rotate the framebuffer: Zinc must rotate its own rendering. Orientation sensing: the accelerometer is an SDL joystick on PDK [U, from PDK samples]. Web mapping: `screen.orientation.type/angle`, `lock()` = call `PDL_SetOrientation` and rotate the GL scene ourselves; `change` event from the accelerometer unless locked.

## 5. Notifications

[C] `PDL_BannerMessagesEnable(PDL_bool)` only turns the system's banners (SMS, voicemail...) on or off for the running app (default on). A PDK program has no PDL call to post one. Candidates [U] via `PDL_ServiceCall`: `palm://com.palm.systemmanager/addBannerMessage` (Mojo `showBanner`; params like `{"msg":"text","launchParams":{},"icon":"...","soundClass":"notifications"}`), `.../createAlert` (modal-ish popup with buttons), `.../clearBannerMessages`; dashboard: `palm://com.palm.systemmanager/publishToSystemUI`-style [U, uncertain]. The Mojo framework calls these from the card's own WebKit host on a private connection, so a jail may be refused. Test (private bus, as root/helper): `luna-send -n 1 palm://com.palm.systemmanager/addBannerMessage '{"msg":"zinc test"}' < /dev/null`. Web mapping: `Notification.requestPermission()` returns `granted`; `new Notification(title,{body,icon})` becomes a banner (title + body in `msg`), `onclick` unsupported unless `launchParams` re-launches the app (then `Notification` click = launch parameters read at start). A fallback with no system support: an in-app toast.

## 6. Location

[C] `PDL_EnableLocationTracking(PDL_bool)` must be called first (asynchronous; `PDL_NOERROR` does not mean tracking is on, the user's GPS setting may be off), then `PDL_GetLocation(PDL_Location*)` polls (`PDL_UNINIT`, `PDL_NOTALLOWED` if the service is off, `PDL_INVALIDINPUT`). Struct fields not fetched [U]: latitude, longitude, altitude, velocity, heading, horizontal/vertical accuracy. Bus: `palm://com.palm.location/getCurrentPosition` `{"accuracy":1,"maximumAge":0,"responseTime":1}`, `startTracking` `{"subscribe":true}` [U]. The Wi-Fi TouchPad has no GPS (3G model not sold in numbers) [U], and the webOS network locator used HP/Google servers that are dead, so expect `PDL_NOTALLOWED`/no fix. Web mapping: `navigator.geolocation.getCurrentPosition/watchPosition/clearWatch`; when no fix, error code 2 (`POSITION_UNAVAILABLE`). Optional: a user-set fixed position in Zinc settings.

## 7. Audio

SDL audio from the PDK goes through PulseAudio (webOS 3 `audiod`/pulse) [U]; the process needs the `pulse-access`-style group in the jail, which the PDK launcher gives (check with `id` and `ls -l /var/run/pulse*`). [C] `PDL_NotifyMusicPlaying(PDL_TRUE)` tells the system media player (and other apps, advisory) to stop: call it when Zinc starts playing audio; returns `PDL_ECONNECTION` on error. Volume keys: the system handles them and the volume applies to the pulse sink; reading or setting it: `palm://com.palm.audio/media/getVolume`/`setVolume`? [U] (audiod methods `/media/setVolume` `{"volume":0-100}`). Bluetooth A2DP: output goes to the BT sink if the system routes it [U].
Media Session: AVRCP/headset buttons are delivered to the media player through `palm://com.palm.keys/media/` signals (`/media/status`, `headset` button, `play/pause/next/prev` events) [U, subscribe like the battery signals with `category` `/media`]; no confirmed PDK route, so Media Session `setActionHandler('play'|'pause'|'nexttrack'|'previoustrack')` stays unimplemented until a probe shows these signals reach us (`ls-monitor` while pressing headset buttons). `metadata` is accepted and ignored (no lock screen widget for PDK). Web Audio is Zinc's own mixer on SDL audio; nothing webOS specific.

## 8. Bluetooth

The TouchPad's radio is a Broadcom BCM4329 combo (Wi-Fi 802.11n, Bluetooth 2.1+EDR, FM) [U, from teardowns]. Bluetooth 2.1 has no BLE (GATT) at all: **Web Bluetooth cannot be implemented on this device**; reply with `NotFoundError`/`navigator.bluetooth` absent. Palm's stack exposes `palm://com.palm.bluetooth/...` [U] with categories like `gap` (`/gap/getRadioState`, `/gap/startDiscovery`, `/gap/getTrustedDevices`), `/spp`, `/hid`, `/a2dp`, `/avrcp`, `/pan`, `/hfg`, `/ftp`; the names come from PmBtStack docs and need `luna-send` probing as root on a private bus (`luna-send -n 1 palm://com.palm.bluetooth/gap/getRadioState '{}' < /dev/null`, after listing with `ls-monitor`). HID keyboards and mice should already work through the system and reach SDL as key events (to check by pairing a keyboard in Settings). SPP serial: probable but unverified; if the stack is BlueZ underneath, the helper can open an `rfcomm` device or an AF_BLUETOOTH socket and pass bytes through a local socket.
Replacements for BLE use cases: Wi-Fi UDP/OSC or WebSocket to a bridge (works today, same network), or a classic-SPP link to a microcontroller (HC-05 style), exposed as Web Serial-like API rather than Web Bluetooth.

## 9. Language, locale, time zone, device

[C] `PDL_GetLanguage(char*buf,int len)` fills `"EN_UK"` (language `_` country, 5 chars; give 64 bytes) from the Luna preferences DB: `navigator.language = "en-GB"` (lowercase, replace `_` by `-`), `navigator.languages`. `PDL_GetRegionCountryCode` exists (task text; page not fetched) for the region. [C] `PDL_GetDeviceName(buf,len)` = the user's name in Device Info (64 bytes; may fail with `PDL_SYSTEMERROR_FILE`); `PDL_GetUniqueID(buf,len)` reads a file once, 64+ bytes (cache; use as a stable id, never expose raw: hash with the origin); `PDL_GetHardware()` is deprecated for `PDL_GetHardwareID()` (pre/pixi/unknown; the enum member for the TouchPad is [U]).
Time zone/time [U]: `palm://com.palm.systemservice/time/getSystemTime` `{"subscribe":true}` answers `{"utc":<seconds>,"offset":<minutes>,"timezone":"Europe/Paris","timezoneAbbreviation":"CEST","isUTC":false...}`; preferences (12/24 h, locale): `palm://com.palm.systemservice/getPreferences` `{"keys":["locale","timeFormat"]}`. Fallback needing no bus: `echo $TZ; ls -l /etc/localtime /var/luna/preferences/` (jail view may be limited). Web mapping: `Intl.DateTimeFormat().resolvedOptions().timeZone`, `navigator.language`; `navigator.userAgentData` = `{brands:[{brand:"Zinc"}], mobile:false, platform:"webOS"}`, `getHighEntropyValues()` with `model:"TouchPad"`, `platformVersion:"3.0.0"`.

## Probe script for the device (run in the jail, then as root)

```sh
for m in "com.palm.power/com/palm/power/batteryStatusQuery" "com.palm.power/com/palm/power/chargerStatusQuery" \
         "com.palm.display/status" "com.palm.display/control/status" "com.palm.connectionmanager/getstatus" \
         "com.palm.wifi/getstatus" "com.palm.systemservice/time/getSystemTime" "com.palm.bluetooth/gap/getRadioState" \
         "com.palm.location/getCurrentPosition" "com.palm.audio/media/getVolume"; do
  echo "== $m"; luna-send -n 1 "palm://$m" '{}' < /dev/null
  echo "== -P $m"; luna-send -P -n 1 "palm://$m" '{}' < /dev/null
done
```
The pair (jail without/with `-P`, root helper) tells which services each privilege reaches; record the results here. No call here is destructive.

## Measured on the tablet (2026-10-15, as root over novacom)

- `batteryStatusQuery` / `chargerStatusQuery` answer nothing themselves: they make powerd send the signals. Subscribe first with
  `palm://com.palm.bus/signal/addmatch {"category":"/com/palm/power","method":"batteryStatus"}` (and `chargerStatus`), then query:
  - battery: `{"percent":100,"percent_ui":100,"temperature_C":27,"current_mA":-2,"voltage_mV":3894,"capacity_mAh":5219.000000,"battery_age":87}`
  - charger on the Mac's USB: `{"type":"usb","name":"pc","connected":true,"current_mA":1400,"message_source":"powerd"}` (the Touchstone's
    values not seen yet: put the tablet on it and query again).
- `palm://com.palm.connectionmanager/getstatus`: `{"isInternetConnectionAvailable":true,"wifi":{"state":"connected","ipAddress":"192.168.10.124",
  "interfaceName":"eth0","ssid":"Freepro-OF8VOP","bssid":"…","networkConfidenceLevel":"excellent","onInternet":"yes",...},"wan":{"state":"disconnected"},...}`
- `palm://com.palm.display/control/status`: `{"event":"request","state":"on","timeout":120,"blockDisplay":"true","active":false}`.
- Not tried yet from the jail (with the app's id): whether these calls are allowed there; root (zinc-helper) can always relay them.
