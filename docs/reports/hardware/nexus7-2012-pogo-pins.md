# Nexus 7 (2012, grouper): the 4 pogo pins

Research only, from the web, 2026-10-18. Nothing was tested on a tablet. Tags: **[S]** sourced, **[I]** inferred, **[?]** unknown.
Several primary pages (XDA threads, iFixit history, Liliputing, Android Central review) returned 403 or a bot wall, so the XDA claims below are second-hand through search snippets. Treat them as leads to verify.

## 1. Pinout and charging

- 4 side pins exist and are for a dock. [S] https://ts.ifixit.com/Answers/History/101028 , https://forums.androidcentral.com/threads/what-is-the-4-pin-connector-used-for.191803/
- Top pin = GND, bottom pin = +5 V. [S] iFixit answer (chosen solution, 2012): https://www.ifixit.com/Answers/View/101028/Charging+Nexus+7+through+pogo+pins
- Pins 2 and 3 (from the top) are audio, right then left. [S, XDA, via snippet, not opened] https://xdaforums.com/t/nexus-7-pogo-gpio-pins-on-side.1800099/ . A second XDA thread gives the order from the bottom as +5 V, left, right, GND. [S, via snippet] https://xdaforums.com/t/home-made-pogo-pin-charging-dock.2019847/page-2 . Both agree on GND and +5 V at the ends and differ only on which middle pin is left or right. Outside the chosen answers, the "dock mode" and audio claims are one forum user's observations.
- Only 5 V on the bottom pin and GND on the top pin was needed to charge. It charged with the tablet off. With the tablet on, the same wiring gave "dock mode", shown as AC charging, and cut the speakers. [S, XDA via snippet]
- One Android Central poster says "Power, Ground and USB Audio". This is an unsourced guess and is not backed by the kernel (section 2). https://forums.androidcentral.com/threads/docking-station.216198
- Voltage and current: 5 V is the only documented value. Current accepted: [?]. The kernel limits input current to 900 mA or 1800 mA (section 2), so a 2 A supply is the sensible target. [I]
- Does it need D+/D- shorted or an ID resistor? The pins have no data pair to short. The kernel reads the dock path with a GPIO (DOCK_IN#) and the charger's DC-IN status, not with APSD. [S, section 2] That suggests plain 5 V on the pin is enough. [I]

## 2. Kernel and Android view

Source: Google's grouper kernel, branch android-tegra3-grouper-3.1-jb-mr2 (LineageOS 14.1 uses a fork of it; its GitHub tree was not readable here, so check that it has the same code).

- Charger is an SMB347 (`drivers/power/smb347-charger.c`). It has a `gpio_dock_in` variable, set to `TEGRA_GPIO_PU4` on normal grouper and `TEGRA_GPIO_PO5` on the NAKASI_3G variant. An ISR (`smb347_dockin_isr`) fires on both edges. A separate `GPIO_AC_OK = TEGRA_GPIO_PV1`. https://android.googlesource.com/kernel/tegra/+/refs/heads/android-tegra3-grouper-3.1-jb-mr2/drivers/power/smb347-charger.c
- Pinmux file marks the pin with the comment `/* DOCK_IN# */` directly above `GPIO_PU4`. https://android.googlesource.com/kernel/tegra/+/refs/heads/android-tegra3-grouper-3.1-jb-mr2/arch/arm/mach-tegra/board-grouper-pinmux.c
- `cable_type_detect()`: if DC-IN is valid (no OV/UV) and `DOCK_IN#` is low, the cable is reported as `ac_cable`. The input limit then goes to 900 mA first and, after a delay, 1800 mA. Otherwise the USB path is read through APSD (SDP, CDP, DCP). Only 900 and 1800 mA exist in the driver. [S, via a summarising fetch of the file, so quotes are paraphrased]
- So the pogo +5 V pin appears to feed the SMB347 DC-IN input, and DOCK_IN# tells the kernel a dock is present. The micro-USB goes to USB-IN. [I, strong but not read from a schematic]
- No dock `switch_dev`/extcon in `smb347-charger.c`, `board-grouper.c`, `board-grouper-misc.c`. The only switch_dev in the audio machine driver is the headset switch. [S] https://android.googlesource.com/kernel/tegra/+/refs/heads/android-tegra3-grouper-3.1-jb-mr2/sound/soc/tegra/tegra_rt5640.c
- Android's `DockObserver` (7.1) broadcasts `ACTION_DOCK_EVENT` with `EXTRA_DOCK_STATE` only from `/sys/class/switch/dock/state` or uevent `DEVPATH=/devices/virtual/switch/dock`. [S] https://android.googlesource.com/platform/frameworks/base/+/refs/tags/android-7.1.2_r1/services/core/java/com/android/server/DockObserver.java . I found no kernel code creating that switch, so a dock broadcast from the pins is **unknown**. Yet 2012 reviews report a "use dock for audio?" prompt and Daydream on dock (Settings > Sound > Dock) on Android 4.2, so something does signal docking. [S] https://www.droid-life.com/2013/01/24/official-nexus-7-dock-hands-on/ , https://www.kitguru.net/?p=117425 . Where it comes from (kernel file I did not read, or a power-connected heuristic) is [?]. Check `/sys/class/switch/` on the tablet.
- Audio: codec is RT5640; headphone detect GPIO is `TEGRA_GPIO_HP_DET = PW2`. Where the dock line-out is routed is [?]. The XDA claim "dock mode cuts the speaker" fits a line-out being switched in. [I] https://android.googlesource.com/kernel/tegra/+/refs/heads/android-tegra3-grouper-3.1-jb-mr2/arch/arm/mach-tegra/board-grouper.h

## 3. Can the pins carry data?

- The kernel shows no USB, UART or I2C on those pins. The ULPI/UART pinmux entries in `board-grouper-pinmux.c` are for the debug UART (UART D), GPS and Bluetooth, not obviously for the connector. [S] (pinmux file above)
- Every source points to power, ground and two audio channels. An owner wished for "true USB" through the dock and did not get it. [S] https://www.adorama.com/asnex7do.html (via search snippet)
- Known hack that sends data over the pogo pins: **none found.** An audio-frequency modem over the two audio lines would be an idea, but that is only an idea. [I]
- Verdict: no data path. The two audio pins are the only signal pins, and which way they run (out of the tablet only) is [?].

## 4. Existing docks and pitfalls

- Official ASUS Nexus 7 dock: about $40 (announced 2012, shipped Jan 2013). It charges through the pins, has a 3.5 mm line-out, and a micro-USB input for the power cable. Needs Android 4.2 or later. Part number: **not found.** [S] https://liliputing.com/asus-nexus-7-dock-coming-this-month-for-40/ , https://www.fonearena.com/blog/65390/google-nexus-7-dock-hands-on.html/amp , https://www.kitguru.net/?p=117425
- Reviews: landscape only, does not always enter dock mode, does not work with a case. [S] https://www.adorama.com/asnex7do.html , https://forums.androidcentral.com/threads/docking-station.216198
- DIY: XDA "Home made pogo pin charging dock" (link above). Pitfalls reported there: pins do not make perfect contact, and a steel washer plus magnet was needed for enough pressure. [S, via snippet] No Instructables, Thingiverse or Hackaday build was found. The closest relative is a Galaxy Nexus pogo kit. [S] https://pocketables.com/2012/09/im-getting-tired-of-waiting-for-the-nexus-7-pogo-pin-dock.html
- The 2013 Nexus 7 has no pogo pins (Qi instead), so don't mix up threads. [S] https://xdaforums.com/t/2013-nexus-7-pogo-pins.2379578/
- Pitfalls: short-circuit risk of a magnet-held +5 V pin against a metal stand; reversed polarity; keep stand pins at 5 V only; current limits unknown (1.8 A input limit in the kernel).

## 5. Recommendation for data

- Charging via pins and data via micro-USB: the SMB347 has two inputs (DC-IN and USB-IN) and the kernel handles both, so using micro-USB as a device (adb, AOA) while pins supply power is plausible. [I, untested] The SMB347 would take power from the pins and the USB cable would only carry data.
- Micro-USB as host (OTG) while charging: stock hardware does not charge in host mode per forum reports (Plugable, EarlyBird). [S] https://support.plugable.com/t/charging-a-nexus7-from-the-usb-2-0-4-hub/6084 , https://forum.earlybird.club/threads/usb-otg-y-cable-for-charging.835713/post-6485716 . Whether pin power changes that is [?], because in host mode the SMB347 drives VBUS from battery.
- Best option: **Wi-Fi** for the stand (no cable, pins only for power), since pins have no data. If a cable is needed, micro-USB as device with `adb reverse` (or `adb` over TCP after `adb tcpip`) while the pins charge. Zinc's `zinc device` / `zinc agent` already work over the network, so Wi-Fi is the lowest risk.

## Checklist on the real tablet (safe first)

1. Power off. With a multimeter in continuity mode, find the 4 pins and mark top to bottom. No voltage applied yet.
2. Read resistance between each pin and GND (top) with the tablet off. A short on any pin stops the work.
3. On the running tablet, measure voltage on all pins against GND (expect 0 V, or something on audio pins).
4. `adb shell ls /sys/class/switch/` and `adb shell cat /sys/class/switch/*/state`, and `cat /sys/class/power_supply/*/online` to see what exists before docking.
5. Start `adb logcat -b all | grep -i -E "dock|smb347|power|audio"` and `adb shell dmesg -w`. Check for lines "smb347_DOCK_IN#", "dc_in=", "Cable:".
6. Current-limited bench supply (5 V, 500 mA limit) on bottom pin = +5 V, top = GND, tablet off. Watch current. Raise the limit to 2 A only if all is stable.
7. Repeat with the tablet on. Check `dumpsys battery` (AC powered?), the dmesg lines above, `dumpsys dock` / `settings` for a dock state and `adb shell dumpsys audio`.
8. Measure the DC level and AC signal on pins 2 and 3 while playing audio, with and without the dock supply. Never connect them to a powered output.
9. With the stand supplying 5 V, test micro-USB as device (adb shows up, battery reports AC) and then as host with an OTG cable, to see whether it still charges.
10. Only then build the stand; use spring pins rated for at least 2 A, and a magnet arrangement that does not bridge pins.
