# reMarkable Paper Pro: the power button as an escape from a stuck app

Research, 2026-10-26 (owner: "can we also quit a stuck app with the power button?"). Nothing was run on the tablet.
Status of each claim: **sourced** (a link), **inferred** (from code we read), **unverified** (needs the tablet).

## 1. What xochitl does with the key

- User manual (sourced, [reMarkable support / manual](https://www.manualslib.tech/guide/803116/remarkable-paper-pro-rm02a-type-folio-rm08b-manual.html)):
  short press = sleep (and wake), hold about 3 s = "power off?" prompt, 10 s = forced off, 25 s = factory-reset mode.
- The key is `/dev/input/event0` (`snvs-powerkey`, `KEY_POWER` = 116) on the rMPP. KOReader's
  [`device.lua`](https://github.com/koreader/koreader/blob/master/frontend/device/remarkable/device.lua) names
  `input_buttons = "/dev/input/event0"` for the Paper Pro and `platform-30370000.snvs:snvs-powerkey-event` on mainline kernels.
- Suspend is `systemctl suspend` (that is what KOReader calls itself). Who calls it for the key in xochitl, and whether
  systemd-logind has `HandlePowerKey=ignore`: **unverified**; no public source says. Nothing public describes the delay between the
  press and the suspend, or whether the suspend is on press or release. This is the one fact the whole design hangs on: measure it (section 4).
- Our wakelock: `display-rmpp` writes `/sys/power/wake_lock` while running (`plugins/display-rmpp/rmpp.cpp`, "autosleep would suspend the SoC").
  A wakelock only blocks opportunistic autosleep, not an explicit `systemctl suspend` (kernel doc, inferred). If xochitl's short press
  goes through autosleep rather than `systemctl suspend`, our own wakelock would already make the short press do nothing during an app. **Unverified**; the
  experiment below shows it for free.

## 2. Existing community work

- **[xovi-tripletap](https://github.com/rmitchellscott/xovi-tripletap)** (README says rMPP, Move and Pure supported). `main.sh` runs
  `evtest /dev/input/event0` (no grab, xochitl keeps the key), counts `code 116 value 1` events, `TIME_THRESHOLD=2` s between presses,
  `REQUIRED_PRESSES=3` (configurable: 2 = double tap), then runs `xovi/start`. So a passive reader of event0 next to xochitl is
  proven in the field on the rMPP, and the press count survives whatever xochitl does with each press (the tablet is usable
  while the triple press is made; whether the 2nd press happens after a suspend and wake is not documented there). It
  waits for xochitl to be idle before acting (3.28+), a hint that the key is also busy with screen work.
- **KOReader on rMPP under qtfb/AppLoad**: removes Power (116, 143) from its event map when `is_qtfb_shimmed/native`, and the Paper Pro entry says
  `canSuspend = no -- Suspend and Standby should be handled by xochitl with KO_DONT_GRAB_INPUT=1 set, otherwise bad things will happen`
  ([device.lua](https://github.com/koreader/koreader/blob/master/frontend/device/remarkable/device.lua)). Confirms: xochitl owns the key,
  grabbing it breaks suspend (matches our own `EVIOCGRAB` rule), apps stay passive.
- **[rm-appload](https://github.com/asivery/rm-appload)**: the shim fakes a `gpio_buttons` device for apps (`shim/src/input-shim.cpp`
  advertises `KEY_HOME/LEFT/RIGHT/WAKEUP/POWER`); no suspend code found, no power handling in the README (only the top-centre drag to close a
  fullscreen app). AppLoad does not treat suspend specially for qtfb apps, as far as the source shows.
- **[rm-xovi-extensions](https://github.com/asivery/rm-xovi-extensions)**: only `random-suspend-screen` (replaces `/usr/share/remarkable/suspended.png`);
  no extension hooks the power key logic. A code search for power/suspend hooks in the repo found nothing else.
- Others (rmkit, yaft Rocket launcher on rM2 using the power button) read the key passively too; none changes xochitl's handling.

## 3. Designs, ranked

| | Design | Cost | Risk | Verdict |
|---|---|---|---|---|
| a | Passive read of event0 in the driver (or in `zinc-watch`): N presses within T = quit. The three-finger escape already runs in the poll loop; a stuck app that stops polling would not see it, so the reader belongs in `zinc-watch` (separate process, already child of the app, 5 s wake) or a tiny thread/`poll` fd there | about 40 lines in C, no new service | Short press still suspends: the tablet may sleep on press 1 and the user sees the sleep screen. Open: does press 2 arrive (wake press is an event?) and how fast. No grab, no xochitl change | **Best, if the measure says presses 1 and 2 are both visible** |
| b | Resume detection: `zinc-watch` compares `CLOCK_BOOTTIME - CLOCK_MONOTONIC` (grows only during suspend); a jump while the heartbeat is stale = the user slept the tablet, so stop the hung app | about 10 lines in the watcher, no input code, works even if the second press is lost | Needs the user to press once and wake once (a normal gesture), acts on the wake; a healthy app is left alone; also safe when the wakelock keeps us awake (then nothing happens, see section 1) | **Cheapest, safest, ship first as the fallback of a** |
| c | XOVI hook on xochitl's power handling | days: no public symbol, firmware-specific | Can brick the sleep path, breaks on each OS update; the project rule forbids touching xochitl | No |
| d | Long press: xochitl's own power-off prompt at 3 s; KOReader-style own timer on `PowerPress` (2 s) | free with a | The prompt belongs to xochitl; a 2 s hold fires before it (3 s), so "hold 2 s" could quit the app before the dialog, if the first suspend does not eat it. Worth testing in the same experiment | Option, after a |

Not proposed: `EVIOCGRAB` (breaks sleep, per KOReader's note). The supervisor-owned grab of the ink lease (L2) is a different mode: xochitl is stopped there.

## 4. Recommendation and cheapest safe experiment

Do b first (no input handling, one number), measure for a on the tablet in the same sitting.

Experiment (read only, 5 minutes, no xochitl restart, nothing installed; the Zinc dashboard app running so the wakelock is held):
1. On the tablet: `journalctl -f -u xochitl &` and `/home/root/xovi-tripletap/evtest /dev/input/event0 | ts` (or `cat /dev/input/event0 | hexdump`; evtest binary from tripletap).
2. Short press once: note the time of `value 1`, `value 0` and of the first journal line that says suspend (or the screen changing); then press again to wake: is a `value 1` event delivered? `cat /sys/power/suspend_stats/success` before and after.
3. Same with the wakelock released (`echo zinc > /sys/power/wake_unlock`) to see whether our lock changes the short press.
4. Two quick presses (under 600 ms apart) with the app on screen: does the tablet already sleep after the first? Does event0 show both?
5. Hold 2 s: does the app-side `PowerPress` to now+2 s come before xochitl's dialog (3 s)? Does the journal show a dialog?
6. `cat /proc/uptime` and `/proc/timer_list`-free check: after a sleep, `clock_gettime(CLOCK_BOOTTIME)` minus `CLOCK_MONOTONIC` should have grown (design b).

Decision table: press 1 does not suspend before press 2 or the wake press is an event, so use a (double press within 600 ms, 2 presses in zinc-watch,
log the line like the three-finger escape). Otherwise ship b: "press power, wake the tablet, a hung app (heartbeat stale 10 s) is stopped". In both
cases the Hub's Stop / Wait choice stays the first answer for a hung app.

Open points for the owner's tablet (cannot be settled by reading code): suspend timing on press vs release, whether the wake press is delivered, wakelock
interaction, whether `HandlePowerKey` is `ignore` in logind.
