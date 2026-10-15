# HP TouchPad (webOS 3.0.0): screen off after N minutes, app keeps running, touch wakes

Research, 2026-10-15. Goal: a PDK card on a charger-powered TouchPad that blacks the screen after N idle minutes, keeps
polling, never suspends, and wakes on touch.

Evidence level. The only complete source found is the open-sourced webOS code (`openwebos/*`, 2012-2013, Qt5 era,
derived from the HP 3.0.x code). The TouchPad ships 3.0.0 (2011) and may differ in details. Everything below is **from
source** unless marked **UNCONFIRMED**; all of it must be verified on the device with the test plan at the end.

Sources (referenced as [n]):

- [1] https://raw.githubusercontent.com/openwebos/luna-sysmgr/master/Src/base/DisplayManager.cpp (the `com.palm.display` service)
- [2] https://raw.githubusercontent.com/openwebos/luna-sysmgr/master/Src/base/DisplayStates.cpp (the state machine)
- [3] https://raw.githubusercontent.com/openwebos/luna-sysmgr/master/service/com.palm.luna.json.prv (LunaSysMgr role, owns `com.palm.display`)
- [4] https://raw.githubusercontent.com/openwebos/powerd/master/powerd/com_palm_power_lunabus.c and `.../powerd/suspend/suspend_ipc.c` (`com.palm.power`, forwards to sleepd)
- [5] https://raw.githubusercontent.com/openwebos/sleepd/master/src/pwrevents/suspend_ipc.c, `activity.c`, `suspend.c`, `.../files/conf/sleepd.conf`
- [6] https://sdk.webosarchive.org/docs/reference/services/display-manager.html (public `status`)
- [7] https://sdk.webosarchive.org/docs/reference/pdk/pdl/pdl-screen-timeout-enable.html and `.../pdl-service-call.html`
- [8] https://raw.githubusercontent.com/openwebos/luna-service2/master/src/luna-send/luna-send.c (`-P` = public bus, private is the default; `-a appId`)
- [9] https://sdk.webosarchive.org/docs/dev-guide/mojo/exhibition.html (Exhibition / `"dockMode": true`)

## Findings in five lines

1. **Touch cannot wake a display that is really "off".** In state Off the sysmgr turns the touch panel off (`touchPanelOff`)
   and swallows all mouse events [1][2]. Wake sources in Off: power key, home key, USB in, `setState on`/`unlock` on the bus,
   incoming call. So the app cannot see the wake touch.
2. **State "dimmed" keeps the touch panel on and a touch wakes it** (`DisplayDim`: UserActivity -> On; the first touch is
   dropped). Dimmed brightness is `max(maximumBrightness/10, 1)` percent, so with `maximumBrightness` 1..9 it is 1 %,
   the floor of the code (`MINIMUM_DIMMED_BRIGHTNESS 1`, "do not go below 1 as we can mess up the touchpanel") [1].
   Backlight 0 is never used while the panel is on. Black pixels at 1 % is the practical "off".
3. **Dimmed stays dimmed** (no dim -> off timer) while a display "block" (DNAST) is held: `DisplayDim::timeout` returns early
   `if (isDNAST())` [2]. The block is `setProperty {"requestBlock":true,"client":...}` on the private bus (a subscription: it
   ends when the caller disconnects) [1], or `onWhenConnected` (see below).
4. **`com.palm.display/control/*` is private-bus only** (`LSRegisterCategory(m_service, "/control", ...)`); the public bus has
   only `status` [1][6]. A PDK app's `PDL_ServiceCall` uses `palm://` (public bus) [7], so it **cannot** reach `setState`,
   `setProperty`, `getProperty` (UNCONFIRMED on 3.0.0, but the public/private split is in the code). As root over novacom,
   `luna-send` defaults to the private bus and has a `privileged` role with `allowedNames ["*"]` [8].
5. **Suspend:** `activityStart`/`activityEnd` of `com.palm.power` ARE public methods [4] (forwarded to
   `luna://com.palm.sleep/com/palm/power/`). And sleepd does not suspend while a charger is connected when
   `suspend_with_charger = false` (the shipped default in the open-source conf) [5]. Both protect against suspend.

## Recommended approach

**Updated with the coordinator's measurements on the tablet** (MEASURED, not from source): backlight node
`/sys/class/leds/lcd-backlight/brightness`, range 0..255, root-only (the app jail is non-root but shares `/tmp` with the
system); `com.palm.display/control/status` -> `{"state":"on","timeout":120,"blockDisplay":"true"}` (so a block is already
held while our app runs: this is consistent with `PDL_ScreenTimeoutEnable(false)` being a DNAST `requestBlock`);
`getProperty` -> `{"maximumBrightness":100,"timeout":120,"onWhenConnected":false}`; `setProperty {"maximumBrightness":0}` as
root drops the LED to **3** (the clamp to 1 % in the source [1]), `100` gives 92. So via the display service the floor is
LED 3, never 0; only a direct sysfs write gives 0.

Three layers, in the order to try:

- **C (recommended): root helper writes the LED node; sysmgr stays "on" and the touch panel stays alive.** The installer
  (root over novacom) installs a tiny root daemon (upstart job or a `sh` loop started by the launcher/installer) that watches a
  file in `/tmp` (the jail shares it), e.g. `/tmp/zinc-backlight`, and does `echo $(cat /tmp/zinc-backlight) >
  /sys/class/leds/lcd-backlight/brightness`. App: `PDL_ScreenTimeoutEnable(PDL_FALSE)` (display stays On, touch works), after
  N minutes draw black and write `0` to the file, on the first touch write the saved level back (read the current value from
  the same sysfs node first, it is world-readable or via the helper: UNCONFIRMED) and redraw. No private-bus role needed, no
  persisted preference touched, true 0 backlight. Risks (UNCONFIRMED): sysmgr rewrites the LED on its own events (ALS change,
  charger events, state change) and wakes it up; the helper can re-apply the wanted value every few seconds. The source warns
  that level 0 with the panel on "can mess up the touchpanel" (`MINIMUM_ON_BRIGHTNESS`, comment) [1]: test T7 first that touches
  still arrive at LED 0. Fallback if so: write `3` (what the service floor gives).
- **A**: fallback with no helper, no private bus (below).
- **B**: private-bus client (below); floor LED 3.

### A. Fallback, public bus only (all from the PDK app)

1. At start: `PDL_ScreenTimeoutEnable(PDL_FALSE)` (documented: the default for a fullscreen PDK app is "never dims" [7]). The
   system then keeps the display On and the touch panel on; the app owns the idle timer (it sees every touch).
2. Keep the CPU/network awake (belt and braces, in case the device is not "charging" in sleepd's eyes), every 10 minutes:
   ```
   PDL_ServiceCall("palm://com.palm.power/com/palm/power/activityStart",
                   "{\"id\":\"org.zinc.keepawake\",\"duration_ms\":900000}");
   ```
   `duration_ms` must be > 0, is clamped to 15 min (`ACTIVITY_MAX_DURATION_MS`), 10 min or more is logged as "high" [5].
   Renew the same `id` before it expires (the same id is replaced/extended; UNCONFIRMED whether it extends or only
   restarts). On exit: `activityEnd` with `{"id":"org.zinc.keepawake"}`.
3. After N idle minutes: stop drawing the UI, clear to black, render nothing (stop the frame loop but keep `SDL_GL_SwapBuffers`
   of one black frame). The backlight stays at the user's level. Any touch: redraw. Cost: the panel stays lit.
   This is not "off", but it is what a public-bus app can do without hacks.

### B. Screen dark with touch wake (needs the private bus)

Calls in order, as the client with a private-bus role (see "How a third-party process gets the private bus"):

1. Block auto-off (subscription, keep the call open):
   `luna://com.palm.display/control/setProperty` `{"requestBlock":true,"client":"org.zinc.app","powerKeyBlock":false,"proximityEnabled":false}`
   Hold on: the schema marks every field REQUIRED in the macro, but the code only reads those present; `luna-send` test T4
   shows what the device accepts. The `timeout` field is left out so the user's setting is not rewritten.
2. Save, then lower the dim level: `luna://com.palm.display/control/getProperty` `{"properties":["maximumBrightness"]}`
   then `.../control/setProperty` `{"maximumBrightness":1}`. This is persisted by sysmgr in luna-prefs (`appProperties/Set`,
   key `maximumBrightness`) [1]: **restore it on wake and at exit**, or the user is left with a dark screen. Range 1..100.
3. "Screen off": `luna://com.palm.display/control/setState` `{"state":"dimmed"}` -> `{"returnValue":true}`. The app also draws black.
   Backlight is 1 %, touch panel on, app keeps running, no off transition while the block is held.
4. Wake: the app receives the touch (the first touch after a dim is dropped by sysmgr: `m_drop_pen`; the second reaches the
   app, or subscribe to `luna://com.palm.display/control/status` / public `palm://com.palm.display/status` `{"subscribe":true}`
   and wake on `{"event":"displayOn"}`). Then `setState` `{"state":"on"}` and `setProperty` `{"maximumBrightness":<saved>}`.
5. Exit: `setProperty` restore, release the block (close the subscription / end the app), `activityEnd`.

Why not `setState off`: the only way back is a key, the bus or USB-in; touch is dead [1][2]. If the owner accepts a wake by
the home or power button instead of touch, `{"state":"off"}` is real off (backlight 0, vsync off, painting disabled, panel off),
but then `PDL_ScreenTimeoutEnable` and the block no longer matter, and sleepd must be told not to suspend (step 2 of A, and
charger rule). Note `setState off` is also refused to be turned "on" again by `on` while in dock mode (see below).

### How a third-party process gets the private bus (UNCONFIRMED on 3.0.0)

ls-hubd authorizes by role file keyed on the executable path: `/usr/share/ls2/roles/prv/<name>.json` (private) and `.../pub/`
(public) [3][4][8]. Format (from `com.palm.power.json.prv.in` [4] and lunasend [8]):
```json
{"role":{"exeName":"/media/cryptofs/apps/usr/palm/applications/org.zinc.app/zinc","type":"regular",
         "allowedNames":["org.zinc.app.display"]},
 "permissions":[{"service":"org.zinc.app.display","inbound":["*"],
                 "outbound":["com.palm.display","com.palm.power"]}]}
```
Our installer already runs as root over novacom, so it can write that file (rootfs may need `mount -o remount,rw /`) and
restart `ls-hubd` (`stop ls-hubd; start ls-hubd` or reboot; whether a rescan command exists on 3.0.0 is unknown). The app
then connects with `LSRegister`/`LSRegisterPalmService` + `LSCall` to `luna://com.palm.display/control/...` from its own
process, not through `PDL_ServiceCall`. Whether the PDK app runs as root or in a jail: UNCONFIRMED (test T1).
This changes system files: a decision for the owner, but reversible (delete the file).

## Reference: com.palm.display (from DisplayManager.cpp [1])

| Bus | URI | Params | Reply |
|---|---|---|---|
| public | `palm://com.palm.display/status` | `{"subscribe":true}` | `{"returnValue":true,"event":"request","state":"on","subscribed":true}`; later `event` = `displayOn`/`displayDimmed`/`displayOff`; `"dockMode":true` on a Touchstone [6] |
| private | `luna://com.palm.display/control/status` | `{"subscribe":true}` | more fields: `timeout`, `blockDisplay`, `active` |
| private | `.../control/setState` | `{"state":"on"\|"dimmed"\|"off"\|"unlock"\|"dock"\|"undock"}` | `{"returnValue":true}` or `{"returnValue":false,"errorText":"call failed"}` |
| private | `.../control/setProperty` | any of `requestBlock`(bool)+`client`(string), `powerKeyBlock`, `proximityEnabled`, `timeout`(int **seconds**, 1/3 off, 2/3 dim; saved to prefs), `onWhenConnected`(bool, saved), `maximumBrightness`(int 1..100, saved) | `{"returnValue":true}` or `{"returnValue":false,"errorCode":22\|25\|43,"errorText":"..."}` |
| private | `.../control/getProperty` | `{"properties":["requestBlock","powerKeyBlock","timeout","maximumBrightness","onWhenConnected","proximityEnabled"]}` | e.g. `{"returnValue":true,"maximumBrightness":75,"timeout":120,"onWhenConnected":false,...}` |

Defaults: timeout 120 s, `DEFAULT_BRIGHTNESS` 40 %, minimum 1 [1]. The "unlock" value also forces On.

Other details that matter here:

- `onWhenConnected: true` (default when luna-prefs is absent) pushes a block as long as a **USB** charger is connected
  (`CHARGER_USB`); the Touchstone is `CHARGER_INDUCTIVE`, a different path [1]. USB-in also wakes an Off display [2].
- **Touchstone / "puck" / dock mode.** On the puck, the dim -> off timeout goes to `DisplayStateDockMode`, not Off
  (`isOnPuck() -> DockMode`) [2]. DockMode: display on at the dimmed level (`MINIMUM_DIMMED_BRIGHTNESS` for the nav area), the
  panel is on, a touch/home key goes to OnPuck [2], power key goes to Off, `setState on` is ignored in dock mode [1].
  This is Exhibition mode; an app opts in with `"dockMode": true` in `appinfo.json` [9] (a PDK app: UNCONFIRMED). If the owner's
  tablet sits on a Touchstone, the system already does most of the job (dim, panel alive, touch wakes). If it sits on a
  USB cable, it does not.
- Off events: touch/mouse events swallowed, a key wakes and its events are eaten until release [1].
- The state machine also has `OffSuspended` (entered only on the `powerd` suspend event) [2].
- Display service owner: LunaSysMgr (role `privileged`, allowedNames includes `com.palm.display` on both buses) [3].

## Exhibition mode (dock mode) in detail

Sources: [10] `openwebos/luna-sysmgr` `Src/base/application/ApplicationDescription.cpp`, `Src/lunaui/dock/DockModeWindowManager.cpp`,
`Src/base/settings/Settings.cpp`, `Src/remote/IpcClientHost.cpp`, `Src/remote/WebAppMgrProxy.cpp`, `conf/default-exhibition-apps.json`
(all under https://raw.githubusercontent.com/openwebos/luna-sysmgr/master/); [9] the developer guide.

| Question | Answer |
|---|---|
| Registration | `appinfo.json`: `"dockMode": true` (older key; `"exhibitionMode": true` is read first, `dockMode` kept "for backward compatibility"). Optional `"dockModeOptions": {"title": "..."}` (or `exhibitionModeOptions`); the title defaults to the menu name. Only booleans are accepted. [10] ApplicationDescription.cpp ~l.370-397. The reference page spells the key lowercase `dockmode` (https://sdk.webosarchive.org/docs/reference/config/appinfo.json.html); the code reads `dockMode`/`exhibitionMode`. |
| The list | A launch point of every app with the flag is "enabled" for dock mode (`ApplicationManager::enableDockModeLaunchPoint`); the user picks the apps in Exhibition settings. Defaults: `/etc/palm/default-exhibition-apps.json` = `{"exhibitionApps":["com.palm.app.photos"],"knownPucks":[]}`, per-user `/var/palm/user-exhibition-apps.json` (`Settings.cpp`; the user path is also built from the home folder, UNCONFIRMED which wins). `knownPucks` maps a puck id to its default app (`addPuckIdAndDefaultApp`). Max `DockModeMaxApps` = 3. The built-in Clock is `DockModeClock` (sysmgr's own). |
| Launch | On the puck the DockMode state starts the exhibition window manager; it launches the app with `WebAppMgrProxy::appLaunch(id, params, "com.palm.launcher")` and params `{"windowType":"dockModeWindow","dockMode":true}` (`DockModeWindowManager::launchApp`). In an Enyo/Mojo app that is `enyo.windowParams.dockMode` / `params.dockMode` in `handleLaunch` [9]. |
| PDK / native apps | **Probably not possible.** The dock window manager only accepts windows of type `Type_DockModeWindow` (`prepareAddWindow`/`addWindow`: "window is not in the list of apps in the launcher" otherwise). That window type is created only on the web-app path (`WebAppMgrProxy`, `case Type_DockModeWindow`). A native/PDK window is announced through `IpcClientHost::onPrepareAddWindow`, which maps every type to `Type_Card` (or `Type_Emergency`) [10]. The native launch itself accepts the params (they arrive as `argv[1]`, `launchNativeApp`), and `dockMode:true` in `appinfo.json` of a `"type":"pdk"` app is parsed (no type check), so the app would be launched but its window is a card, which the dock manager rejects/does not host. UNCONFIRMED on the 3.0.0 binary. A web "stub" exhibition app can launch the PDK card with `palm://com.palm.applicationManager/launch` `{"id":"org.zinc.app"}`, but the card then replaces the dock stage, so it gains nothing. |
| Display in dock mode | Dim -> off timeout on the puck goes to `DockMode`, not Off. `DisplayDockMode::enter` calls `displayOn(false)`, touch panel and painting on, orientation sensor on [2]. Brightness: `getDisplayBrightness()` (the normal user level, with the ALS scaling), not the 1 % dim level; only the nav-area LED uses the dimmed floor [1]. A night level exists in config, `DockModeNightBrightness` = 1 (default), but no use of it was found in the display code: UNCONFIRMED. |
| Touch in dock mode | Works: the panel is on; a touch/home key moves to `OnPuck` (full app UI, leaves dock mode if off the puck) [2]. `setState on` is ignored while in dock mode; `undock` goes On/OnPuck [1]. |
| Detect it | Public `palm://com.palm.display/status` -> `"dockMode":true` [6]; `luna://com.palm.systemmanager/getDockModeStatus` `{"subscribe":false}` (private, `SystemService.cpp`) [10]. |
| Relevance | Only helps a **Touchstone** setup, and only for web apps. For a USB-cable charger there is no puck: use C. Not recommended as the way to blank the screen. |

## Reference: power

| Call | Bus | Payload | Notes |
|---|---|---|---|
| `palm://com.palm.power/com/palm/power/activityStart` | public [4] | `{"id":"<unique string>","duration_ms":<int > 0>}` | clamped to 900000 ms; invalid -> `returnValue:false` "malformed json"; "Activities Frozen" when the system is already suspending [5] |
| `palm://com.palm.power/com/palm/power/activityEnd` | public [4] | `{"id":"<same id>"}` | |
| `.../forceSuspend`, `suspendRequestRegister`, `identify`, `TESTSuspend` | private [4] | | do not call |

sleepd suspend rule [5]: state On while the display is on, or an activity is held, or within `after_resume_idle_ms` (1000) of
a resume. After idle it goes to OnIdle; "if the device is connected to charger and `suspend_with_charger` is false, the device
goes back to On" (no suspend). Shipped `sleepd.conf`: `suspend_with_charger = false`, `wait_idle_ms = 500`. The device config
is in `sleepd.conf` somewhere under `/etc` (or `/etc/palm`): find it on the device (T5). UNCONFIRMED that 3.0.0 has this key
(the 2011 TouchPad did suspend on the dock in some reports; no source found).

## Reference: PDK and settings

| Item | Finding |
|---|---|
| `PDL_ScreenTimeoutEnable(PDL_bool)` | `PDL_FALSE` = screen never dims while fullscreen; default is already "never dims"; returns `PDL_ECONNECTION` if the card cannot be reached [7]. Implementation not found; probably the app-side of a DNAST block (UNCONFIRMED). |
| `PDL_ServiceCall(uri, payload)` | one-way, no reply; `PDL_ServiceCallWithCallback` for replies; URI form `palm://service/method` (public bus) [7] |
| `PDL_SetFirewallPortStatus` | opens a port for the app; unrelated to display/power, not researched |
| `com.palm.systemservice` `screenBrightness` | not found in any source; brightness is `maximumBrightness` on `com.palm.display` [1]. UNCONFIRMED whether systemservice exposes a preference. |
| sysfs backlight on the TouchPad | **not found** in any source (search for `/sys/class/backlight`, `lm8502`, `leds`: nothing for the TouchPad). The sysmgr does not write sysfs itself: it calls nyx `LedControl::setBrightness` [1], the nyx module's path is not documented here. Run `ls /sys/class/backlight /sys/class/leds` on the device (T6). Writing it directly would also fight sysmgr (it resets the level on a state change) and `0` with the panel on is what the code avoids. |
| Preware patches ("screen off", Exhibition) | none found in two searches (webosarchive, the web); no claim made |

## On-device test plan (root over novacom; every call ends `< /dev/null`)

Prompt: `novacom -t open tty://` or `novacom run file:///bin/sh`. Private bus is the default for `luna-send`; `-P` is the
public bus; `-a <appId>` sets the app id [8].

```sh
# T1  who are we, what is installed
id; ls /usr/share/ls2/roles/prv | grep -i -E 'display|power|sleep'; ls /usr/share/ls2/roles/pub | grep -i -E 'display|power|sleep'
cat /usr/share/ls2/roles/prv/com.palm.display* /usr/share/ls2/roles/pub/com.palm.display* 2>/dev/null
cat /usr/share/ls2/roles/pub/com.palm.power* 2>/dev/null | head -40

# T2  public bus as a third-party app: is anything beyond status reachable?
luna-send -P -a org.zinc.app -n 1 palm://com.palm.display/status '{"subscribe":false}' < /dev/null
luna-send -P -a org.zinc.app -n 1 palm://com.palm.display/control/setState '{"state":"dimmed"}' < /dev/null   # expect a permission error
luna-send -P -a org.zinc.app -n 1 palm://com.palm.power/com/palm/power/activityStart '{"id":"org.zinc.t","duration_ms":60000}' < /dev/null  # expect returnValue true

# T3  private bus (root): read the current properties, then do the dim sequence by hand
luna-send -n 1 -f luna://com.palm.display/control/getProperty '{"properties":["maximumBrightness","timeout","requestBlock","onWhenConnected"]}' < /dev/null
luna-send -n 1 -f luna://com.palm.display/control/status '{"subscribe":false}' < /dev/null
luna-send -n 1 -f luna://com.palm.display/control/setProperty '{"maximumBrightness":1}' < /dev/null
luna-send -n 1 -f luna://com.palm.display/control/setState '{"state":"dimmed"}' < /dev/null
#   look at the screen: 1 % backlight. Touch it: it must come back, and the first touch is dropped.
luna-send -n 1 -f luna://com.palm.display/control/setProperty '{"maximumBrightness":40}' < /dev/null   # restore the value read above

# T4  the block (the call must stay alive: run it in the background, kill it to release)
luna-send -i -f luna://com.palm.display/control/setProperty '{"requestBlock":true,"client":"zinc-test"}' < /dev/null &
BLK=$!
luna-send -n 1 -f luna://com.palm.display/control/setState '{"state":"dimmed"}' < /dev/null
#   wait more than timeout/3 (set it short first: setProperty '{"timeout":30}'); the screen must stay dimmed, not go off. Then:
kill $BLK; luna-send -n 1 -f luna://com.palm.display/control/setProperty '{"timeout":120}' < /dev/null

# T5  does it suspend on the charger with the display off? (the real question)
luna-send -n 1 -f luna://com.palm.display/control/setState '{"state":"off"}' < /dev/null
#   from a second novacom shell: a loop that logs every 10 s, run it 10+ minutes on USB, then on the Touchstone
while true; do date; sleep 10; done > /tmp/tick.log &
#   gaps in /tmp/tick.log = suspended. Also: find / -name 'sleepd.conf' 2>/dev/null; grep -r suspend_with_charger /etc 2>/dev/null
#   wake: luna-send -n 1 -f luna://com.palm.display/control/setState '{"state":"on"}' < /dev/null
#   and try a touch while off (expected: nothing), then the home key.

# T6  sysfs and the Touchstone
ls -l /sys/class/backlight /sys/class/leds 2>/dev/null
luna-send -n 1 -f palm://com.palm.display/status '{"subscribe":true}' < /dev/null   # put it on the Touchstone: expect "dockMode":true
```

```sh
# T7  approach C: true LED 0 with the panel alive
cat /sys/class/leds/lcd-backlight/brightness /sys/class/leds/lcd-backlight/max_brightness
echo 0 > /sys/class/leds/lcd-backlight/brightness     # screen black?  Now touch it with the app running: do touches still arrive?
echo 92 > /sys/class/leds/lcd-backlight/brightness    # restore the value read above
#   leave it at 0 for 2 minutes: does sysmgr rewrite it (cat the node every 5 s)?  Repeat on USB and on the Touchstone.
#   from the jail: ls -l /tmp; echo 0 > /tmp/zinc-backlight   (the helper must pick it up)
```

Pass criteria. Approach B works if T3 and T4 behave as above. Approach A is the fallback if T2 shows the public bus refuses
`setState` (expected). If T5 shows suspend on the charger, keep `activityStart` renewed (A.2); if it never suspends, skip it.

## Unconfirmed list

- The 3.0.0 TouchPad behaves like the open-source 2012-13 code (states, Dim not going Off under a block, `suspend_with_charger`).
- Whether a PDK app's `palm://` calls are limited to the public bus and a role named by app id; whether the app runs as root.
- Whether `activityStart` with a repeated id extends the deadline; the exact meaning of `PDL_ScreenTimeoutEnable(false)` in sysmgr.
- That a role file in `/usr/share/ls2/roles/prv` for a third-party exe is honoured by the 3.0.0 `ls-hubd` and how to reload it.
- Whether `dockMode: true` is accepted for PDK apps; the TouchPad backlight sysfs node.
